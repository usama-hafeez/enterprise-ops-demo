import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatusBadgeComponent } from '../ui';

interface Requisition {
  id: number;
  ref: string;
  status: string;
  created_at: string;
  customer_id: number;
  customer: string;
}

interface LineRow {
  id: number;
  product_id: number;
  product: string;
  sku: string;
  qty_requested: number;
  qty_allocated: number;
  backordered: number;
}

interface AllocationRow {
  id: number;
  product: string;
  warehouse: string;
  qty: number;
  unit_cost_cents: number;
}

@Component({
  selector: 'app-requisition-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (requisition(); as r) {
      <header class="page-header">
        <h1>{{ r.ref }} <app-status [value]="r.status" /></h1>
        <p>
          <a [routerLink]="['/customers', r.customer_id]">{{ r.customer }}</a>
          &middot; created {{ r.created_at.slice(0, 10) }}
        </p>
      </header>

      <section class="card">
        <h2>Lines</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Part</th><th>SKU</th>
              <th class="num">Requested</th><th class="num">Allocated</th>
              <th class="num">Backordered</th>
            </tr>
          </thead>
          <tbody>
            @for (line of lines(); track line.id) {
              <tr>
                <td><a [routerLink]="['/products', line.product_id]">{{ line.product }}</a></td>
                <td>{{ line.sku }}</td>
                <td class="num">{{ line.qty_requested }}</td>
                <td class="num">{{ line.qty_allocated }}</td>
                <td class="num">{{ line.backordered || '-' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      @if (allocations().length > 0) {
        <section class="card">
          <h2>Allocations</h2>
          <table class="grid">
            <thead>
              <tr>
                <th>Part</th><th>From warehouse</th>
                <th class="num">Qty</th><th class="num">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              @for (a of allocations(); track a.id) {
                <tr>
                  <td>{{ a.product }}</td>
                  <td>{{ a.warehouse }}</td>
                  <td class="num">{{ a.qty }}</td>
                  <td class="num">{{ a.unit_cost_cents | money }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (invoiceId(); as invId) {
        <p class="card-note">
          Invoiced as <a [routerLink]="['/invoices', invId]">{{ invoiceNumber() }}</a>
        </p>
      }
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class RequisitionDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly requisition = signal<Requisition | undefined>(undefined);
  readonly lines = signal<LineRow[]>([]);
  readonly allocations = signal<AllocationRow[]>([]);
  readonly invoiceId = signal<number | undefined>(undefined);
  readonly invoiceNumber = signal('');

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.requisition.set(
      await this.data.one<Requisition>(
        `SELECT r.id, r.ref, r.status, r.created_at, c.id AS customer_id, c.name AS customer
           FROM requisitions r JOIN customers c ON c.id = r.customer_id
          WHERE r.id = ?`,
        [id],
      ),
    );
    this.lines.set(
      await this.data.query<LineRow>(
        `SELECT l.id, p.id AS product_id, p.name AS product, p.sku,
                l.qty_requested, l.qty_allocated,
                (SELECT COALESCE(SUM(b.qty), 0) FROM backorders b
                  WHERE b.requisition_line_id = l.id AND b.status = 'open') AS backordered
           FROM requisition_lines l JOIN products p ON p.id = l.product_id
          WHERE l.requisition_id = ? ORDER BY l.id`,
        [id],
      ),
    );
    this.allocations.set(
      await this.data.query<AllocationRow>(
        `SELECT a.id, p.name AS product, w.name AS warehouse, a.qty, a.unit_cost_cents
           FROM allocations a
           JOIN requisition_lines l ON l.id = a.requisition_line_id
           JOIN products p ON p.id = l.product_id
           JOIN stock st ON st.id = a.stock_id
           JOIN warehouses w ON w.id = st.warehouse_id
          WHERE l.requisition_id = ? ORDER BY a.id`,
        [id],
      ),
    );
    const inv = await this.data.one<{ id: number; number: string }>(
      'SELECT id, number FROM invoices WHERE requisition_id = ?',
      [id],
    );
    if (inv) {
      this.invoiceId.set(inv.id);
      this.invoiceNumber.set(inv.number);
    }
  }
}
