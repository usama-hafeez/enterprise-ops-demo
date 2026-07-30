import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent } from '../ui';

interface Supplier {
  id: number;
  code: string;
  name: string;
  email: string;
  country: string;
  lead_time_days: number;
}

interface LotRow {
  id: number;
  product_id: number;
  product: string;
  sku: string;
  warehouse: string;
  qty_on_hand: number;
  unit_cost_cents: number;
  is_priority: number;
}

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (supplier(); as s) {
      <header class="page-header">
        <h1>{{ s.name }} <span class="muted">({{ s.code }})</span></h1>
        <p>{{ s.email }} &middot; {{ s.country }} &middot; {{ s.lead_time_days }}-day lead time</p>
      </header>

      <div class="stat-row">
        <app-stat [value]="units().toLocaleString()" label="Units on hand" />
        <app-stat [value]="money(value())" label="Stock value at cost" />
      </div>

      <section class="card">
        <h2>Stock lots from this supplier</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Part</th><th>SKU</th><th>Warehouse</th>
              <th class="num">On hand</th><th class="num">Unit cost</th><th>Priority</th>
            </tr>
          </thead>
          <tbody>
            @for (lot of lots(); track lot.id) {
              <tr>
                <td><a [routerLink]="['/products', lot.product_id]">{{ lot.product }}</a></td>
                <td>{{ lot.sku }}</td>
                <td>{{ lot.warehouse }}</td>
                <td class="num">{{ lot.qty_on_hand }}</td>
                <td class="num">{{ lot.unit_cost_cents | money }}</td>
                <td>{{ lot.is_priority ? 'priority' : '-' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">No stock lots.</td></tr>
            }
          </tbody>
        </table>
        <p class="muted">Showing the 25 most valuable lots.</p>
      </section>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class SupplierDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly supplier = signal<Supplier | undefined>(undefined);
  readonly lots = signal<LotRow[]>([]);
  readonly units = signal(0);
  readonly value = signal(0);

  private readonly moneyPipe = new MoneyPipe();
  money(cents: number): string {
    return this.moneyPipe.transform(cents);
  }

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.supplier.set(
      await this.data.one<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]),
    );
    const totals = await this.data.one<{ units: number; value: number }>(
      `SELECT COALESCE(SUM(qty_on_hand), 0) AS units,
              COALESCE(SUM(qty_on_hand * unit_cost_cents), 0) AS value
         FROM stock WHERE supplier_id = ?`,
      [id],
    );
    this.units.set(totals?.units ?? 0);
    this.value.set(totals?.value ?? 0);
    this.lots.set(
      await this.data.query<LotRow>(
        `SELECT st.id, p.id AS product_id, p.name AS product, p.sku, w.name AS warehouse,
                st.qty_on_hand, st.unit_cost_cents, st.is_priority
           FROM stock st
           JOIN products p ON p.id = st.product_id
           JOIN warehouses w ON w.id = st.warehouse_id
          WHERE st.supplier_id = ?
          ORDER BY st.qty_on_hand * st.unit_cost_cents DESC LIMIT 25`,
        [id],
      ),
    );
  }
}
