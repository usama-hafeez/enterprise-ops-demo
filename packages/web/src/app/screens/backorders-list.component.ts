import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { PagerComponent, StatusBadgeComponent } from '../ui';

interface BackorderRow {
  id: number;
  requisition_id: number;
  ref: string;
  customer: string;
  product: string;
  product_id: number;
  qty: number;
  status: string;
}

const PAGE = 25;

@Component({
  selector: 'app-backorders-list',
  standalone: true,
  imports: [RouterLink, PagerComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Backorders</h1>
      <p>Demand the warehouses could not satisfy - waiting on supplier replenishment.</p>
    </header>

    <table class="grid">
      <thead>
        <tr>
          <th>Requisition</th>
          <th>Customer</th>
          <th>Part</th>
          <th class="num">Qty short</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        @for (b of rows(); track b.id) {
          <tr>
            <td>
              <a [routerLink]="['/requisitions', b.requisition_id]">{{ b.ref }}</a>
            </td>
            <td>{{ b.customer }}</td>
            <td>
              <a [routerLink]="['/products', b.product_id]">{{ b.product }}</a>
            </td>
            <td class="num">{{ b.qty }}</td>
            <td><app-status [value]="b.status" /></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="5" class="empty">No open backorders.</td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class BackordersListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly rows = signal<BackorderRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);

  ngOnInit(): void {
    void this.load();
  }

  go(offset: number): void {
    this.offset.set(Math.max(0, offset));
    void this.load();
  }

  private async load(): Promise<void> {
    const count = await this.data.one<{ n: number }>('SELECT COUNT(*) AS n FROM backorders');
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<BackorderRow>(
        `SELECT b.id, r.id AS requisition_id, r.ref, c.name AS customer,
                p.name AS product, p.id AS product_id, b.qty, b.status
           FROM backorders b
           JOIN requisition_lines l ON l.id = b.requisition_line_id
           JOIN requisitions r ON r.id = l.requisition_id
           JOIN customers c ON c.id = r.customer_id
           JOIN products p ON p.id = l.product_id
          ORDER BY b.id DESC LIMIT ${PAGE} OFFSET ?`,
        [this.offset()],
      ),
    );
  }
}
