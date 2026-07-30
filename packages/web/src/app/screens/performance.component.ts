import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SeedConfig } from '@enterprise-ops/core';
import { DemoService } from '../demo.service';
import { RunPanelComponent } from '../run-panel.component';
import { CiResultsComponent } from '../ci-results.component';

/**
 * The engineering screen: the same requisition pipeline implemented naively
 * and optimized, run side by side against a fresh copy of the demo database
 * in Web Workers, with live query counters and an output-hash equality check.
 */
@Component({
  selector: 'app-performance',
  standalone: true,
  imports: [DecimalPipe, RunPanelComponent, CiResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Performance</h1>
      <p>
        The nightly batch behind these screens - allocation, backorders, invoicing, FIFO
        settlement - implemented twice: naive (per-row lookups, full loads) and optimized (batched
        reads, keyset pagination, composite indexes). Same input, provably identical output.
      </p>
    </header>

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

    <div class="notice">
      <strong>What this screen runs:</strong> SQLite (sql.js compiled to WebAssembly) in a Web
      Worker, on a fresh copy of the seed database - screen edits are not included. In-process
      SQLite pays no network round-trip, so the wall-clock gap is much smaller than over a real
      connection; the query counts are the signal. The table below is the headline measurement:
      MySQL 8 driven by the same code.
      @if (volumes(); as v) {
        <span>
          Volumes here: {{ v.requisitions | number }} requisitions,
          {{ v.products * 4 | number }} stock rows, {{ v.invoices | number }} invoices,
          {{ v.payments | number }} payments.
        </span>
      }
    </div>

    <app-ci-results />
  `,
})
export class PerformanceComponent implements OnInit {
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
