import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent, StatusBadgeComponent } from '../ui';

interface Invoice {
  id: number;
  number: string;
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  issued_at: string;
  customer_id: number;
  customer: string;
  requisition_id: number | null;
  requisition_ref: string | null;
}

interface ApplicationRow {
  id: number;
  payment_id: number;
  amount_cents: number;
  received_at: string;
}

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (invoice(); as inv) {
      <header class="page-header">
        <h1>{{ inv.number }} <app-status [value]="inv.status" /></h1>
        <p>
          <a [routerLink]="['/customers', inv.customer_id]">{{ inv.customer }}</a>
          &middot; issued {{ inv.issued_at.slice(0, 10) }}
          @if (inv.requisition_id) {
            &middot; from requisition
            <a [routerLink]="['/requisitions', inv.requisition_id]">{{ inv.requisition_ref }}</a>
          }
        </p>
      </header>

      <div class="stat-row">
        <app-stat [value]="money(inv.total_cents)" label="Invoice total" />
        <app-stat [value]="money(inv.amount_paid_cents)" label="Paid" />
        <app-stat [value]="money(inv.total_cents - inv.amount_paid_cents)" label="Outstanding" />
      </div>

      <section class="card">
        <h2>Payment applications (FIFO)</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Payment</th>
              <th>Received</th>
              <th class="num">Applied</th>
            </tr>
          </thead>
          <tbody>
            @for (app of applications(); track app.id) {
              <tr>
                <td>#{{ app.payment_id }}</td>
                <td>{{ app.received_at.slice(0, 10) }}</td>
                <td class="num">{{ app.amount_cents | money }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3" class="empty">No payments applied yet.</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="muted">
          Payments settle a customer's invoices oldest-first; overpayment becomes account credit.
        </p>
      </section>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class InvoiceDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly invoice = signal<Invoice | undefined>(undefined);
  readonly applications = signal<ApplicationRow[]>([]);

  private readonly moneyPipe = new MoneyPipe();
  money(cents: number): string {
    return this.moneyPipe.transform(cents);
  }

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.invoice.set(
      await this.data.one<Invoice>(
        `SELECT i.id, i.number, i.status, i.total_cents, i.amount_paid_cents, i.issued_at,
                c.id AS customer_id, c.name AS customer,
                i.requisition_id, r.ref AS requisition_ref
           FROM invoices i
           JOIN customers c ON c.id = i.customer_id
           LEFT JOIN requisitions r ON r.id = i.requisition_id
          WHERE i.id = ?`,
        [id],
      ),
    );
    this.applications.set(
      await this.data.query<ApplicationRow>(
        `SELECT pa.id, pa.payment_id, pa.amount_cents, p.received_at
           FROM payment_applications pa JOIN payments p ON p.id = pa.payment_id
          WHERE pa.invoice_id = ? ORDER BY pa.id`,
        [id],
      ),
    );
  }
}
