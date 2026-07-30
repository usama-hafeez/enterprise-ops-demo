import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent } from '../ui';

interface Warehouse {
  id: number;
  code: string;
  name: string;
  distance_km: number;
}

interface LotRow {
  id: number;
  product_id: number;
  product: string;
  sku: string;
  supplier: string;
  qty_on_hand: number;
  unit_cost_cents: number;
  is_priority: number;
}

@Component({
  selector: 'app-warehouse-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (warehouse(); as w) {
      <header class="page-header">
        <h1>{{ w.name }} <span class="muted">({{ w.code }})</span></h1>
        <p>{{ w.distance_km }} km from the dispatch hub.</p>
      </header>

      <div class="stat-row">
        <app-stat [value]="units().toLocaleString()" label="Units on hand" />
        <app-stat [value]="money(value())" label="Stock value at cost" />
        <app-stat [value]="priorityLots().toLocaleString()" label="Priority lots" />
      </div>

      <section class="card">
        <h2>Most valuable stock held here</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Part</th><th>SKU</th><th>Supplier</th>
              <th class="num">On hand</th><th class="num">Unit cost</th><th>Priority</th>
            </tr>
          </thead>
          <tbody>
            @for (lot of lots(); track lot.id) {
              <tr>
                <td><a [routerLink]="['/products', lot.product_id]">{{ lot.product }}</a></td>
                <td>{{ lot.sku }}</td>
                <td>{{ lot.supplier }}</td>
                <td class="num">{{ lot.qty_on_hand }}</td>
                <td class="num">{{ lot.unit_cost_cents | money }}</td>
                <td>{{ lot.is_priority ? 'priority' : '-' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class WarehouseDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly warehouse = signal<Warehouse | undefined>(undefined);
  readonly lots = signal<LotRow[]>([]);
  readonly units = signal(0);
  readonly value = signal(0);
  readonly priorityLots = signal(0);

  private readonly moneyPipe = new MoneyPipe();
  money(cents: number): string {
    return this.moneyPipe.transform(cents);
  }

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.warehouse.set(
      await this.data.one<Warehouse>('SELECT * FROM warehouses WHERE id = ?', [id]),
    );
    const totals = await this.data.one<{ units: number; value: number; prio: number }>(
      `SELECT COALESCE(SUM(qty_on_hand), 0) AS units,
              COALESCE(SUM(qty_on_hand * unit_cost_cents), 0) AS value,
              COALESCE(SUM(is_priority), 0) AS prio
         FROM stock WHERE warehouse_id = ?`,
      [id],
    );
    this.units.set(totals?.units ?? 0);
    this.value.set(totals?.value ?? 0);
    this.priorityLots.set(totals?.prio ?? 0);
    this.lots.set(
      await this.data.query<LotRow>(
        `SELECT st.id, p.id AS product_id, p.name AS product, p.sku, s.name AS supplier,
                st.qty_on_hand, st.unit_cost_cents, st.is_priority
           FROM stock st
           JOIN products p ON p.id = st.product_id
           JOIN suppliers s ON s.id = st.supplier_id
          WHERE st.warehouse_id = ?
          ORDER BY st.qty_on_hand * st.unit_cost_cents DESC LIMIT 25`,
        [id],
      ),
    );
  }
}
