import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SeedConfig } from '@enterprise-ops/core';
import { DemoService } from './demo.service';
import { RunPanelComponent } from './run-panel.component';
import { CiResultsComponent } from './ci-results.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DecimalPipe, RunPanelComponent, CiResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>enterprise-ops-demo</h1>
      <p class="lede">
        The same requisition pipeline - allocation, backorders, invoicing, FIFO settlement -
        implemented twice. The naive variant does per-row lookups and full table loads with no
        composite indexes; the optimized one batches reads, paginates by keyset, and runs with
        them. Same input, provably identical output, very different cost.
      </p>

      <div class="notice">
        <strong>What this page runs:</strong> SQLite (sql.js compiled to WebAssembly) in your
        browser, in a Web Worker - no server behind it. In-process SQLite pays no network
        round-trip, so the wall-clock gap here is much smaller than over a real connection; the
        query counts are the signal. The table further down shows the headline measurement:
        MySQL 8 in GitHub Actions.
        @if (volumes(); as v) {
          <span>
            Browser volumes: {{ v.requisitions | number }} requisitions,
            {{ v.products * 4 | number }} stock rows, {{ v.invoices | number }} invoices,
            {{ v.payments | number }} payments (half the MySQL benchmark's, to keep the seed
            download small).
          </span>
        }
      </div>

      <div class="actions">
        <button class="primary" (click)="runBoth()" [disabled]="demo.anyRunning()">
          Run both (naive first)
        </button>
        @if (demo.hashesMatch() === true) {
          <span class="verdict ok">output hashes match - identical business outcome</span>
        } @else if (demo.hashesMatch() === false) {
          <span class="verdict bad">output hashes differ - this would be a bug</span>
        }
      </div>

      <div class="panels">
        <app-run-panel variant="naive" />
        <app-run-panel variant="optimized" />
      </div>

      <app-ci-results />

      <footer>
        <p>
          All data is synthetic and deterministic (seeded PRNG). MIT licensed - the README
          covers how to run the full MySQL version locally with docker compose.
        </p>
      </footer>
    </main>
  `,
})
export class AppComponent implements OnInit {
  readonly demo = inject(DemoService);
  readonly volumes = signal<SeedConfig | undefined>(undefined);

  ngOnInit(): void {
    fetch('browser-volumes.json')
      .then((res) => (res.ok ? res.json() : undefined))
      .then((json: SeedConfig | undefined) => this.volumes.set(json))
      .catch(() => this.volumes.set(undefined));
  }

  runBoth(): void {
    void this.demo.runBoth();
  }
}
