import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { PagerComponent, StatusBadgeComponent } from '../ui';

interface ReqRow {
  id: number;
  ref: string;
  customer: string;
  customer_id: number;
  status: string;
  created_at: string;
  lines: number;
}

const PAGE = 25;
const STATUSES = ['all', 'pending', 'invoiced', 'backordered'] as const;

@Component({
  selector: 'app-requisitions-list',
  standalone: true,
  imports: [RouterLink, PagerComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Requisitions</h1>
      <p>Customer orders for laptop spares, from intake to invoicing.</p>
      <a class="button primary" routerLink="/requisitions/new">New requisition</a>
    </header>

    <div class="toolbar">
      <div class="filter-row">
        @for (s of statuses; track s) {
          <button
            type="button"
            class="chip"
            [class.chip-active]="status() === s"
            (click)="setStatus(s)"
          >
            {{ s }}
          </button>
        }
      </div>
    </div>

    <table class="grid">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Customer</th>
          <th>Created</th>
          <th class="num">Lines</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        @for (r of rows(); track r.id) {
          <tr>
            <td>
              <a [routerLink]="['/requisitions', r.id]">{{ r.ref }}</a>
            </td>
            <td>
              <a [routerLink]="['/customers', r.customer_id]">{{ r.customer }}</a>
            </td>
            <td>{{ r.created_at.slice(0, 10) }}</td>
            <td class="num">{{ r.lines }}</td>
            <td><app-status [value]="r.status" /></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="5" class="empty">No requisitions match.</td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class RequisitionsListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly statuses = STATUSES;
  readonly rows = signal<ReqRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly status = signal<(typeof STATUSES)[number]>('all');

  ngOnInit(): void {
    void this.load();
  }

  setStatus(status: (typeof STATUSES)[number]): void {
    this.status.set(status);
    this.offset.set(0);
    void this.load();
  }

  go(offset: number): void {
    this.offset.set(Math.max(0, offset));
    void this.load();
  }

  private async load(): Promise<void> {
    const filter = this.status() === 'all' ? '' : 'WHERE r.status = ?';
    const params = this.status() === 'all' ? [] : [this.status()];
    const count = await this.data.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM requisitions r ${filter}`,
      params,
    );
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<ReqRow>(
        `SELECT r.id, r.ref, c.name AS customer, c.id AS customer_id, r.status, r.created_at,
                (SELECT COUNT(*) FROM requisition_lines l WHERE l.requisition_id = r.id) AS lines
           FROM requisitions r JOIN customers c ON c.id = r.customer_id
          ${filter}
          ORDER BY r.created_at DESC, r.id DESC LIMIT ${PAGE} OFFSET ?`,
        [...params, this.offset()],
      ),
    );
  }
}
