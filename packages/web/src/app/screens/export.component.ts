import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DbService } from '../db.service';

/**
 * Client-side CSV export of the allocation and settlement activity. Rows are
 * pulled through the executor's async iterator in order, mirroring how the
 * NestJS API streams the same export over HTTP without assembling it in
 * memory (at browser volumes the assembled blob is small).
 */
@Component({
  selector: 'app-export',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>CSV export</h1>
      <p>Download the full allocation and settlement activity as CSV.</p>
    </header>

    <div class="card form">
      <p>
        One row per allocation (which part left which warehouse for which requisition) and one per
        payment application (which payment settled which invoice). The server version streams this
        over HTTP row-batch by row-batch.
      </p>
      @if (rowCount() !== undefined) {
        <p class="card-note">Exported {{ rowCount()!.toLocaleString() }} rows.</p>
      }
      <div class="form-actions">
        <button class="primary" type="button" (click)="download()" [disabled]="busy()">
          {{ busy() ? 'Exporting...' : 'Download export.csv' }}
        </button>
      </div>
    </div>
  `,
})
export class ExportComponent {
  private readonly data = inject(DbService);

  readonly busy = signal(false);
  readonly rowCount = signal<number | undefined>(undefined);

  async download(): Promise<void> {
    this.busy.set(true);
    try {
      await this.data.init();
      const parts: string[] = [
        'record_type,requisition_ref,product_sku,warehouse,payment_id,invoice_number,qty,amount_cents\n',
      ];
      let rows = 0;
      for await (const row of this.data.db.iterate<Record<string, unknown>>(
        `SELECT 'allocation' AS record_type, r.ref, p.sku, w.code AS warehouse,
                '' AS payment_id, '' AS invoice_number, a.qty, a.qty * a.unit_cost_cents AS amount_cents
           FROM allocations a
           JOIN requisition_lines l ON l.id = a.requisition_line_id
           JOIN requisitions r ON r.id = l.requisition_id
           JOIN products p ON p.id = l.product_id
           JOIN stock st ON st.id = a.stock_id
           JOIN warehouses w ON w.id = st.warehouse_id
          ORDER BY a.id`,
      )) {
        parts.push(this.csvRow(row));
        rows++;
      }
      for await (const row of this.data.db.iterate<Record<string, unknown>>(
        `SELECT 'settlement' AS record_type, '' AS ref, '' AS sku, '' AS warehouse,
                pa.payment_id, i.number AS invoice_number, '' AS qty, pa.amount_cents
           FROM payment_applications pa JOIN invoices i ON i.id = pa.invoice_id
          ORDER BY pa.id`,
      )) {
        parts.push(this.csvRow(row));
        rows++;
      }
      this.rowCount.set(rows);
      const blob = new Blob(parts, { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      this.busy.set(false);
    }
  }

  private csvRow(row: Record<string, unknown>): string {
    return (
      Object.values(row)
        .map((v) => String(v ?? ''))
        .join(',') + '\n'
    );
  }
}
