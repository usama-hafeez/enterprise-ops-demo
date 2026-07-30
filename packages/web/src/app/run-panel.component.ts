import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Variant } from '@enterprise-ops/core';
import { DemoService } from './demo.service';

@Component({
  selector: 'app-run-panel',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [class.optimized]="variant() === 'optimized'">
      <header>
        <h2>{{ variant() }}</h2>
        <p class="tagline">{{ tagline() }}</p>
      </header>

      <button (click)="run()" [disabled]="state().status === 'loading' || state().status === 'running'">
        @if (state().status === 'loading') {
          fetching seed...
        } @else if (state().status === 'running') {
          running...
        } @else {
          Run {{ variant() }}
        }
      </button>

      <dl class="metrics">
        <div>
          <dt>queries</dt>
          <dd class="num">{{ displayQueries() | number }}</dd>
        </div>
        <div>
          <dt>wall clock</dt>
          <dd class="num">{{ displaySeconds() }}</dd>
        </div>
      </dl>

      @if (state().status === 'done' && state().result; as result) {
        <table class="totals">
          <tbody>
            <tr><th>allocations</th><td>{{ result.totals.allocations | number }}</td></tr>
            <tr><th>backorders</th><td>{{ result.totals.backorders | number }}</td></tr>
            <tr><th>invoices created</th><td>{{ result.totals.invoicesCreated | number }}</td></tr>
            <tr><th>payments settled</th><td>{{ result.totals.payments | number }}</td></tr>
            <tr><th>credits booked</th><td>{{ result.totals.credits | number }}</td></tr>
            <tr><th>output hash</th><td class="hash">{{ result.outputHash }}</td></tr>
          </tbody>
        </table>
      }
      @if (state().status === 'error') {
        <p class="error">{{ state().error }}</p>
      }
    </section>
  `,
})
export class RunPanelComponent {
  readonly variant = input.required<Variant>();
  private readonly demo = inject(DemoService);

  readonly state = computed(() =>
    this.variant() === 'naive' ? this.demo.naive() : this.demo.optimized(),
  );

  readonly tagline = computed(() =>
    this.variant() === 'naive'
      ? 'per-row lookups, full loads, no composite indexes'
      : 'batched reads, keyset pagination, composite indexes',
  );

  readonly displayQueries = computed(() => {
    const s = this.state();
    return s.result ? s.result.queries : s.liveQueries;
  });

  readonly displaySeconds = computed(() => {
    const s = this.state();
    const ms = s.result ? s.result.wallMs : s.liveElapsedMs;
    return `${(ms / 1000).toFixed(2)} s`;
  });

  run(): void {
    void this.demo.run(this.variant());
  }
}
