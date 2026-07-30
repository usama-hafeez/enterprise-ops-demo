import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';

interface ManufacturerRow {
  id: number;
  code: string;
  name: string;
  country: string;
  products: number;
  unitsInStock: number;
}

@Component({
  selector: 'app-manufacturers-list',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Manufacturers</h1>
      <p>Original manufacturers of the parts in the catalogue.</p>
    </header>

    <table class="grid">
      <thead>
        <tr>
          <th>Code</th>
          <th>Name</th>
          <th>Country</th>
          <th class="num">Catalogue parts</th>
          <th class="num">Units in stock</th>
        </tr>
      </thead>
      <tbody>
        @for (m of rows(); track m.id) {
          <tr>
            <td><a [routerLink]="['/manufacturers', m.id]">{{ m.code }}</a></td>
            <td>{{ m.name }}</td>
            <td>{{ m.country }}</td>
            <td class="num">{{ m.products.toLocaleString() }}</td>
            <td class="num">{{ m.unitsInStock.toLocaleString() }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ManufacturersListComponent implements OnInit {
  private readonly data = inject(DbService);
  readonly rows = signal<ManufacturerRow[]>([]);

  async ngOnInit(): Promise<void> {
    this.rows.set(
      await this.data.query<ManufacturerRow>(
        `SELECT m.id, m.code, m.name, m.country,
                COUNT(DISTINCT p.id) AS products,
                COALESCE(SUM(st.qty_on_hand), 0) AS unitsInStock
           FROM manufacturers m
           LEFT JOIN products p ON p.manufacturer_id = m.id
           LEFT JOIN stock st ON st.product_id = p.id
          GROUP BY m.id ORDER BY m.id`,
      ),
    );
  }
}
