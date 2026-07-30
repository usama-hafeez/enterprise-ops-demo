import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';

interface WarehouseRow {
  id: number;
  code: string;
  name: string;
  distance_km: number;
  lots: number;
  units: number;
  value: number;
}

@Component({
  selector: 'app-warehouses-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Warehouses</h1>
      <p>Allocation prefers priority stock, then the nearest warehouse by distance.</p>
    </header>

    <table class="grid">
      <thead>
        <tr>
          <th>Code</th>
          <th>Name</th>
          <th class="num">Distance</th>
          <th class="num">Stock lots</th>
          <th class="num">Units</th>
          <th class="num">Value at cost</th>
        </tr>
      </thead>
      <tbody>
        @for (w of rows(); track w.id) {
          <tr>
            <td>
              <a [routerLink]="['/warehouses', w.id]">{{ w.code }}</a>
            </td>
            <td>{{ w.name }}</td>
            <td class="num">{{ w.distance_km }} km</td>
            <td class="num">{{ w.lots.toLocaleString() }}</td>
            <td class="num">{{ w.units.toLocaleString() }}</td>
            <td class="num">{{ w.value | money }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class WarehousesListComponent implements OnInit {
  private readonly data = inject(DbService);
  readonly rows = signal<WarehouseRow[]>([]);

  async ngOnInit(): Promise<void> {
    this.rows.set(
      await this.data.query<WarehouseRow>(
        `SELECT w.id, w.code, w.name, w.distance_km,
                COUNT(st.id) AS lots,
                COALESCE(SUM(st.qty_on_hand), 0) AS units,
                COALESCE(SUM(st.qty_on_hand * st.unit_cost_cents), 0) AS value
           FROM warehouses w LEFT JOIN stock st ON st.warehouse_id = w.id
          GROUP BY w.id ORDER BY w.distance_km`,
      ),
    );
  }
}
