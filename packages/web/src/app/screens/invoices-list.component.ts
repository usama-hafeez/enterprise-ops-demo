import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { PagerComponent, StatusBadgeComponent } from '../ui';

interface InvoiceRow {
  id: number;
  number: string;
  customer: string;
  customer_id: number;
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  issued_at: string;
}

const PAGE = 25;
const STATUSES = ['all', 'open', 'partial', 'paid'] as const;

@Component({
  selector: 'app-invoices-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe, PagerComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Invoices</h1>
      <p>Sales invoices, settled oldest-first by incoming payments.</p>
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
          <th>Invoice</th>
          <th>Customer</th>
          <th>Issued</th>
          <th class="num">Total</th>
          <th class="num">Paid</th>
          <th class="num">Outstanding</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        @for (inv of rows(); track inv.id) {
          <tr>
            <td>
              <a [routerLink]="['/invoices', inv.id]">{{ inv.number }}</a>
            </td>
            <td>
              <a [routerLink]="['/customers', inv.customer_id]">{{ inv.customer }}</a>
            </td>
            <td>{{ inv.issued_at.slice(0, 10) }}</td>
            <td class="num">{{ inv.total_cents | money }}</td>
            <td class="num">{{ inv.amount_paid_cents | money }}</td>
            <td class="num">{{ inv.total_cents - inv.amount_paid_cents | money }}</td>
            <td><app-status [value]="inv.status" /></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="7" class="empty">No invoices match.</td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class InvoicesListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly statuses = STATUSES;
  readonly rows = signal<InvoiceRow[]>([]);
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
    const filter = this.status() === 'all' ? '' : 'WHERE i.status = ?';
    const params = this.status() === 'all' ? [] : [this.status()];
    const count = await this.data.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM invoices i ${filter}`,
      params,
    );
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<InvoiceRow>(
        `SELECT i.id, i.number, c.name AS customer, c.id AS customer_id, i.status,
                i.total_cents, i.amount_paid_cents, i.issued_at
           FROM invoices i JOIN customers c ON c.id = i.customer_id
          ${filter}
          ORDER BY i.issued_at DESC, i.id DESC LIMIT ${PAGE} OFFSET ?`,
        [...params, this.offset()],
      ),
    );
  }
}
