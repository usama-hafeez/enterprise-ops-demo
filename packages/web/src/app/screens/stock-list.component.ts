import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { PagerComponent } from '../ui';

interface StockRow {
  id: number;
  product_id: number;
  product: string;
  sku: string;
  warehouse: string;
  supplier: string;
  qty_on_hand: number;
  unit_cost_cents: number;
  is_priority: number;
}

const PAGE = 25;

@Component({
  selector: 'app-stock-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe, PagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Stock</h1>
      <p>Every lot on hand, across all four warehouses.</p>
    </header>

    <div class="toolbar">
      <input
        type="search"
        placeholder="Search by part or SKU"
        [value]="search()"
        (input)="onSearch($event)"
      />
      <label class="check">
        <input type="checkbox" [checked]="inStockOnly()" (change)="toggleInStock()" />
        In stock only
      </label>
    </div>

    <table class="grid">
      <thead>
        <tr>
          <th>Part</th><th>SKU</th><th>Warehouse</th><th>Supplier</th>
          <th class="num">On hand</th><th class="num">Unit cost</th><th>Priority</th>
        </tr>
      </thead>
      <tbody>
        @for (s of rows(); track s.id) {
          <tr>
            <td><a [routerLink]="['/products', s.product_id]">{{ s.product }}</a></td>
            <td>{{ s.sku }}</td>
            <td>{{ s.warehouse }}</td>
            <td>{{ s.supplier }}</td>
            <td class="num">{{ s.qty_on_hand }}</td>
            <td class="num">{{ s.unit_cost_cents | money }}</td>
            <td>{{ s.is_priority ? 'priority' : '-' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="empty">No stock lots match.</td></tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class StockListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly rows = signal<StockRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly search = signal('');
  readonly inStockOnly = signal(true);

  ngOnInit(): void {
    void this.load();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.offset.set(0);
    void this.load();
  }

  toggleInStock(): void {
    this.inStockOnly.update((v) => !v);
    this.offset.set(0);
    void this.load();
  }

  go(offset: number): void {
    this.offset.set(Math.max(0, offset));
    void this.load();
  }

  private async load(): Promise<void> {
    const like = `%${this.search()}%`;
    const stockFilter = this.inStockOnly() ? 'AND st.qty_on_hand > 0' : '';
    const where = `WHERE (p.name LIKE ? OR p.sku LIKE ?) ${stockFilter}`;
    const count = await this.data.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM stock st JOIN products p ON p.id = st.product_id ${where}`,
      [like, like],
    );
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<StockRow>(
        `SELECT st.id, p.id AS product_id, p.name AS product, p.sku,
                w.name AS warehouse, s.name AS supplier,
                st.qty_on_hand, st.unit_cost_cents, st.is_priority
           FROM stock st
           JOIN products p ON p.id = st.product_id
           JOIN warehouses w ON w.id = st.warehouse_id
           JOIN suppliers s ON s.id = st.supplier_id
          ${where}
          ORDER BY st.id LIMIT ${PAGE} OFFSET ?`,
        [like, like, this.offset()],
      ),
    );
  }
}
