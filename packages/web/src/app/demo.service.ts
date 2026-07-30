import { Injectable, computed, signal } from '@angular/core';
import { Variant } from '@enterprise-ops/core';
import { RunResultPayload, WorkerMessage } from './messages';

export interface RunState {
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  liveQueries: number;
  liveElapsedMs: number;
  result?: RunResultPayload;
  error?: string;
}

const idle: RunState = { status: 'idle', liveQueries: 0, liveElapsedMs: 0 };

@Injectable({ providedIn: 'root' })
export class DemoService {
  private seedPromise: Promise<ArrayBuffer> | undefined;

  readonly naive = signal<RunState>(idle);
  readonly optimized = signal<RunState>(idle);
  readonly anyRunning = computed(
    () =>
      ['loading', 'running'].includes(this.naive().status) ||
      ['loading', 'running'].includes(this.optimized().status),
  );
  /** Set once both variants have finished: did they produce identical output? */
  readonly hashesMatch = computed<boolean | undefined>(() => {
    const a = this.naive().result;
    const b = this.optimized().result;
    return a && b ? a.outputHash === b.outputHash : undefined;
  });

  private state(variant: Variant) {
    return variant === 'naive' ? this.naive : this.optimized;
  }

  private seed(): Promise<ArrayBuffer> {
    this.seedPromise ??= fetch('seed.sqlite').then((res) => {
      if (!res.ok) throw new Error(`seed.sqlite: HTTP ${res.status}`);
      return res.arrayBuffer();
    });
    return this.seedPromise;
  }

  async run(variant: Variant): Promise<void> {
    const state = this.state(variant);
    if (['loading', 'running'].includes(state().status)) return;
    state.set({ ...idle, status: 'loading' });
    let seed: ArrayBuffer;
    try {
      seed = await this.seed();
    } catch (err) {
      state.set({ ...idle, status: 'error', error: String(err) });
      return;
    }
    state.set({ ...idle, status: 'running' });

    await new Promise<void>((resolve) => {
      const worker = new Worker(new URL('./pipeline.worker', import.meta.url), {
        type: 'module',
      });
      // A worker that fails to even load (bad chunk URL, wasm fetch blocked)
      // must surface as an error, not an eternal spinner.
      worker.onerror = (event) => {
        state.update((s) => ({
          ...s,
          status: 'error',
          error: event.message || 'worker failed to load',
        }));
        worker.terminate();
        resolve();
      };
      worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.type === 'progress') {
          state.update((s) => ({ ...s, liveQueries: data.queries, liveElapsedMs: data.elapsedMs }));
        } else {
          if (data.type === 'done') {
            state.update((s) => ({ ...s, status: 'done', result: data.result }));
          } else {
            state.update((s) => ({ ...s, status: 'error', error: data.message }));
          }
          worker.terminate();
          resolve();
        }
      };
      // Each run gets its own copy so the cached seed stays intact.
      worker.postMessage({ variant, seed: seed.slice(0) });
    });
  }

  /** Naive first, then optimized - sequential, so neither steals CPU time. */
  async runBoth(): Promise<void> {
    await this.run('naive');
    await this.run('optimized');
  }
}
