import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';

interface SupplierRow {
  id: number;
  code: string;
  name: string;
  email: string;
  country: string;
  lead_time_days: number;
  lots: number;
  stockValue: number;
}

@Component({
  selector: 'app-suppliers-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Suppliers</h1>
      <p>Where the stock lots come from, with contracted lead times.</p>
    </header>

    <table class="grid">
      <thead>
        <tr>
          <th>Code</th>
          <th>Name</th>
          <th>Country</th>
          <th class="num">Lead time</th>
          <th class="num">Stock lots</th>
          <th class="num">Stock value</th>
        </tr>
      </thead>
      <tbody>
        @for (s of rows(); track s.id) {
          <tr>
            <td>
              <a [routerLink]="['/suppliers', s.id]">{{ s.code }}</a>
            </td>
            <td>{{ s.name }}</td>
            <td>{{ s.country }}</td>
            <td class="num">{{ s.lead_time_days }} days</td>
            <td class="num">{{ s.lots.toLocaleString() }}</td>
            <td class="num">{{ s.stockValue | money }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class SuppliersListComponent implements OnInit {
  private readonly data = inject(DbService);
  readonly rows = signal<SupplierRow[]>([]);

  async ngOnInit(): Promise<void> {
    this.rows.set(
      await this.data.query<SupplierRow>(
        `SELECT s.id, s.code, s.name, s.email, s.country, s.lead_time_days,
                COUNT(st.id) AS lots,
                COALESCE(SUM(st.qty_on_hand * st.unit_cost_cents), 0) AS stockValue
           FROM suppliers s LEFT JOIN stock st ON st.supplier_id = s.id
          GROUP BY s.id ORDER BY s.id`,
      ),
    );
  }
}
