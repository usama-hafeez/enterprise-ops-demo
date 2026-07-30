import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent } from '../ui';

interface Product {
  id: number;
  sku: string;
  name: string;
  manufacturer_id: number;
  manufacturer: string;
}

interface StockLot {
  id: number;
  warehouse: string;
  supplier: string;
  supplier_id: number;
  qty_on_hand: number;
  unit_cost_cents: number;
  is_priority: number;
}

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (product(); as p) {
      <header class="page-header">
        <h1>{{ p.name }}</h1>
        <p>
          {{ p.sku }} &middot; made by
          <a [routerLink]="['/manufacturers', p.manufacturer_id]">{{ p.manufacturer }}</a>
        </p>
      </header>

      <div class="stat-row">
        <app-stat [value]="onHand().toLocaleString()" label="Units on hand" />
        <app-stat [value]="allocated().toLocaleString()" label="Units allocated to date" />
        <app-stat [value]="backordered().toLocaleString()" label="Units on open backorder" />
      </div>

      <section class="card">
        <h2>Stock by warehouse</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Warehouse</th>
              <th>Supplier</th>
              <th class="num">On hand</th>
              <th class="num">Unit cost</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            @for (lot of lots(); track lot.id) {
              <tr>
                <td>{{ lot.warehouse }}</td>
                <td>
                  <a [routerLink]="['/suppliers', lot.supplier_id]">{{ lot.supplier }}</a>
                </td>
                <td class="num">{{ lot.qty_on_hand }}</td>
                <td class="num">{{ lot.unit_cost_cents | money }}</td>
                <td>{{ lot.is_priority ? 'priority' : '-' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty">No stock lots for this part.</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="muted">
          Allocation always takes priority lots first, then the nearest warehouse, then the lowest
          unit cost.
        </p>
      </section>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class ProductDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly product = signal<Product | undefined>(undefined);
  readonly lots = signal<StockLot[]>([]);
  readonly onHand = signal(0);
  readonly allocated = signal(0);
  readonly backordered = signal(0);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.product.set(
      await this.data.one<Product>(
        `SELECT p.id, p.sku, p.name, p.manufacturer_id, m.name AS manufacturer
           FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id
          WHERE p.id = ?`,
        [id],
      ),
    );
    this.lots.set(
      await this.data.query<StockLot>(
        `SELECT st.id, w.name AS warehouse, s.name AS supplier, s.id AS supplier_id,
                st.qty_on_hand, st.unit_cost_cents, st.is_priority
           FROM stock st
           JOIN warehouses w ON w.id = st.warehouse_id
           JOIN suppliers s ON s.id = st.supplier_id
          WHERE st.product_id = ?
          ORDER BY st.is_priority DESC, w.distance_km ASC, st.unit_cost_cents ASC`,
        [id],
      ),
    );
    const onHand = await this.data.one<{ n: number }>(
      'SELECT COALESCE(SUM(qty_on_hand), 0) AS n FROM stock WHERE product_id = ?',
      [id],
    );
    this.onHand.set(onHand?.n ?? 0);
    const allocated = await this.data.one<{ n: number }>(
      `SELECT COALESCE(SUM(a.qty), 0) AS n
         FROM allocations a JOIN requisition_lines l ON l.id = a.requisition_line_id
        WHERE l.product_id = ?`,
      [id],
    );
    this.allocated.set(allocated?.n ?? 0);
    const backordered = await this.data.one<{ n: number }>(
      `SELECT COALESCE(SUM(b.qty), 0) AS n
         FROM backorders b JOIN requisition_lines l ON l.id = b.requisition_line_id
        WHERE l.product_id = ? AND b.status = 'open'`,
      [id],
    );
    this.backordered.set(backordered?.n ?? 0);
  }
}
