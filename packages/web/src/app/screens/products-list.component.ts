import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { PagerComponent } from '../ui';

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  manufacturer: string;
  onHand: number;
}

const PAGE = 25;

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [RouterLink, PagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Products</h1>
      <p>The laptop spare parts catalogue.</p>
    </header>

    <div class="toolbar">
      <input
        type="search"
        placeholder="Search by part name or SKU"
        [value]="search()"
        (input)="onSearch($event)"
      />
    </div>

    <table class="grid">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Part</th>
          <th>Manufacturer</th>
          <th class="num">Units on hand</th>
        </tr>
      </thead>
      <tbody>
        @for (p of rows(); track p.id) {
          <tr>
            <td>{{ p.sku }}</td>
            <td><a [routerLink]="['/products', p.id]">{{ p.name }}</a></td>
            <td>{{ p.manufacturer }}</td>
            <td class="num">{{ p.onHand }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="empty">No parts match.</td></tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class ProductsListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly rows = signal<ProductRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly search = signal('');

  ngOnInit(): void {
    void this.load();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.offset.set(0);
    void this.load();
  }

  go(offset: number): void {
    this.offset.set(Math.max(0, offset));
    void this.load();
  }

  private async load(): Promise<void> {
    const like = `%${this.search()}%`;
    const count = await this.data.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM products WHERE name LIKE ? OR sku LIKE ?',
      [like, like],
    );
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<ProductRow>(
        `SELECT p.id, p.sku, p.name, m.name AS manufacturer,
                (SELECT COALESCE(SUM(qty_on_hand), 0) FROM stock st WHERE st.product_id = p.id) AS onHand
           FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id
          WHERE p.name LIKE ? OR p.sku LIKE ?
          ORDER BY p.id LIMIT ${PAGE} OFFSET ?`,
        [like, like, this.offset()],
      ),
    );
  }
}
