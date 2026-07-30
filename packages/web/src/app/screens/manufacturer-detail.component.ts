import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';

interface Manufacturer {
  id: number;
  code: string;
  name: string;
  country: string;
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  onHand: number;
}

@Component({
  selector: 'app-manufacturer-detail',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (manufacturer(); as m) {
      <header class="page-header">
        <h1>{{ m.name }} <span class="muted">({{ m.code }})</span></h1>
        <p>{{ m.country }}</p>
      </header>

      <section class="card">
        <h2>Catalogue parts ({{ total().toLocaleString() }})</h2>
        <table class="grid">
          <thead>
            <tr><th>SKU</th><th>Part</th><th class="num">Units on hand</th></tr>
          </thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr>
                <td>{{ p.sku }}</td>
                <td><a [routerLink]="['/products', p.id]">{{ p.name }}</a></td>
                <td class="num">{{ p.onHand }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="muted">Showing the first 25 by SKU.</p>
      </section>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class ManufacturerDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly manufacturer = signal<Manufacturer | undefined>(undefined);
  readonly products = signal<ProductRow[]>([]);
  readonly total = signal(0);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.manufacturer.set(
      await this.data.one<Manufacturer>('SELECT * FROM manufacturers WHERE id = ?', [id]),
    );
    const count = await this.data.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM products WHERE manufacturer_id = ?',
      [id],
    );
    this.total.set(count?.n ?? 0);
    this.products.set(
      await this.data.query<ProductRow>(
        `SELECT p.id, p.sku, p.name,
                (SELECT COALESCE(SUM(qty_on_hand), 0) FROM stock st WHERE st.product_id = p.id) AS onHand
           FROM products p WHERE p.manufacturer_id = ?
          ORDER BY p.sku LIMIT 25`,
        [id],
      ),
    );
  }
}
