import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SeedConfig } from '@enterprise-ops/core';

interface CiVariant {
  queries: number;
  wallMs: number;
  peakRssBytes: number;
  outputHash: string;
}

interface CiResults {
  generatedAt: string;
  gitSha: string | null;
  mysqlVersion: string;
  volumes: SeedConfig;
  naive: CiVariant;
  optimized: CiVariant;
  change: { queriesPct: number; wallPct: number; peakRssPct: number };
}

@Component({
  selector: 'app-ci-results',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ci">
      <h2>The headline numbers: MySQL 8, measured in CI</h2>
      @if (results(); as r) {
        <p class="provenance">
          benchmarks/run.ts against MySQL {{ r.mysqlVersion }} in GitHub Actions,
          {{ r.generatedAt | date: 'yyyy-MM-dd HH:mm' : 'UTC' }} UTC
          @if (r.gitSha) {
            at commit <code>{{ r.gitSha.slice(0, 7) }}</code>
          }
          - seed {{ r.volumes.seed }}, {{ r.volumes.requisitions | number }} requisitions,
          {{ r.volumes.products * 4 | number }} stock rows,
          {{ r.volumes.invoices | number }} invoices, {{ r.volumes.payments | number }} payments.
        </p>
        <table>
          <thead>
            <tr>
              <th>variant</th>
              <th>queries</th>
              <th>wall clock</th>
              <th>peak RSS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>naive</th>
              <td>{{ r.naive.queries | number }}</td>
              <td>{{ (r.naive.wallMs / 1000).toFixed(1) }} s</td>
              <td>{{ (r.naive.peakRssBytes / 1024 / 1024).toFixed(1) }} MB</td>
            </tr>
            <tr>
              <th>optimized</th>
              <td>{{ r.optimized.queries | number }}</td>
              <td>{{ (r.optimized.wallMs / 1000).toFixed(1) }} s</td>
              <td>{{ (r.optimized.peakRssBytes / 1024 / 1024).toFixed(1) }} MB</td>
            </tr>
            <tr class="change">
              <th>change</th>
              <td>{{ r.change.queriesPct }}%</td>
              <td>{{ r.change.wallPct }}%</td>
              <td>{{ r.change.peakRssPct }}%</td>
            </tr>
          </tbody>
        </table>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <p>loading results.json...</p>
      }
    </section>
  `,
})
export class CiResultsComponent implements OnInit {
  readonly results = signal<CiResults | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);

  ngOnInit(): void {
    fetch('results.json')
      .then((res) => {
        if (!res.ok) throw new Error(`results.json: HTTP ${res.status}`);
        return res.json();
      })
      .then((json: CiResults) => this.results.set(json))
      .catch((err) => this.error.set(String(err)));
  }
}
