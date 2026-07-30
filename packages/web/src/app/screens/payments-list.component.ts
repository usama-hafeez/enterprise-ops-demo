import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { PagerComponent } from '../ui';

interface PaymentRow {
  id: number;
  customer: string;
  customer_id: number;
  amount_cents: number;
  received_at: string;
  applied: number;
  invoicesSettled: number;
}

const PAGE = 25;

@Component({
  selector: 'app-payments-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe, PagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Payments</h1>
      <p>Incoming customer payments and how they were applied.</p>
      <a class="button primary" routerLink="/payments/new">Record payment</a>
    </header>

    <table class="grid">
      <thead>
        <tr>
          <th>#</th>
          <th>Customer</th>
          <th>Received</th>
          <th class="num">Amount</th>
          <th class="num">Applied</th>
          <th class="num">Invoices touched</th>
        </tr>
      </thead>
      <tbody>
        @for (p of rows(); track p.id) {
          <tr>
            <td>{{ p.id }}</td>
            <td>
              <a [routerLink]="['/customers', p.customer_id]">{{ p.customer }}</a>
            </td>
            <td>{{ p.received_at.slice(0, 10) }}</td>
            <td class="num">{{ p.amount_cents | money }}</td>
            <td class="num">{{ p.applied | money }}</td>
            <td class="num">{{ p.invoicesSettled }}</td>
          </tr>
        } @empty {
          <tr>
            <td colspan="6" class="empty">No payments.</td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
    <p class="muted">
      "Applied" below "Amount" means part of the payment became account credit (no open invoices
      left to settle).
    </p>
  `,
})
export class PaymentsListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly rows = signal<PaymentRow[]>([]);
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
    const count = await this.data.one<{ n: number }>('SELECT COUNT(*) AS n FROM payments');
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<PaymentRow>(
        `SELECT p.id, c.name AS customer, c.id AS customer_id, p.amount_cents, p.received_at,
                (SELECT COALESCE(SUM(pa.amount_cents), 0) FROM payment_applications pa
                  WHERE pa.payment_id = p.id) AS applied,
                (SELECT COUNT(*) FROM payment_applications pa
                  WHERE pa.payment_id = p.id) AS invoicesSettled
           FROM payments p JOIN customers c ON c.id = p.customer_id
          ORDER BY p.id DESC LIMIT ${PAGE} OFFSET ?`,
        [this.offset()],
      ),
    );
  }
}
