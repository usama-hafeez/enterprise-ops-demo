import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent, StatusBadgeComponent } from '../ui';

interface Customer {
  id: number;
  name: string;
  email: string;
}

interface ReqRow {
  id: number;
  ref: string;
  status: string;
  created_at: string;
  lines: number;
}

interface InvoiceRow {
  id: number;
  number: string;
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  issued_at: string;
}

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (customer(); as c) {
      <header class="page-header">
        <h1>{{ c.name }}</h1>
        <p>{{ c.email }}</p>
        <a class="button" routerLink="/payments/new" [queryParams]="{ customer: c.id }">
          Record payment
        </a>
      </header>

      <div class="stat-row">
        <app-stat [value]="money(outstanding())" label="Outstanding balance" />
        <app-stat [value]="money(credit())" label="Credit on account" />
      </div>

      <div class="two-col">
        <section class="card">
          <h2>Requisitions</h2>
          <table class="grid">
            <thead>
              <tr><th>Ref</th><th>Created</th><th class="num">Lines</th><th>Status</th></tr>
            </thead>
            <tbody>
              @for (r of requisitions(); track r.id) {
                <tr>
                  <td><a [routerLink]="['/requisitions', r.id]">{{ r.ref }}</a></td>
                  <td>{{ r.created_at.slice(0, 10) }}</td>
                  <td class="num">{{ r.lines }}</td>
                  <td><app-status [value]="r.status" /></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">No requisitions yet.</td></tr>
              }
            </tbody>
          </table>
        </section>

        <section class="card">
          <h2>Invoices</h2>
          <table class="grid">
            <thead>
              <tr>
                <th>Invoice</th><th>Issued</th><th class="num">Total</th>
                <th class="num">Paid</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of invoices(); track inv.id) {
                <tr>
                  <td><a [routerLink]="['/invoices', inv.id]">{{ inv.number }}</a></td>
                  <td>{{ inv.issued_at.slice(0, 10) }}</td>
                  <td class="num">{{ inv.total_cents | money }}</td>
                  <td class="num">{{ inv.amount_paid_cents | money }}</td>
                  <td><app-status [value]="inv.status" /></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">No invoices yet.</td></tr>
              }
            </tbody>
          </table>
        </section>
      </div>
    } @else {
      <p class="loading">Loading&hellip;</p>
    }
  `,
})
export class CustomerDetailComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly customer = signal<Customer | undefined>(undefined);
  readonly requisitions = signal<ReqRow[]>([]);
  readonly invoices = signal<InvoiceRow[]>([]);
  readonly outstanding = signal(0);
  readonly credit = signal(0);

  private readonly moneyPipe = new MoneyPipe();
  money(cents: number): string {
    return this.moneyPipe.transform(cents);
  }

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.customer.set(
      await this.data.one<Customer>('SELECT id, name, email FROM customers WHERE id = ?', [id]),
    );
    this.requisitions.set(
      await this.data.query<ReqRow>(
        `SELECT r.id, r.ref, r.status, r.created_at,
                (SELECT COUNT(*) FROM requisition_lines l WHERE l.requisition_id = r.id) AS lines
           FROM requisitions r WHERE r.customer_id = ?
          ORDER BY r.created_at DESC, r.id DESC LIMIT 15`,
        [id],
      ),
    );
    this.invoices.set(
      await this.data.query<InvoiceRow>(
        `SELECT id, number, status, total_cents, amount_paid_cents, issued_at
           FROM invoices WHERE customer_id = ?
          ORDER BY issued_at DESC, id DESC LIMIT 15`,
        [id],
      ),
    );
    const out = await this.data.one<{ cents: number }>(
      `SELECT COALESCE(SUM(total_cents - amount_paid_cents), 0) AS cents
         FROM invoices WHERE customer_id = ? AND status IN ('open', 'partial')`,
      [id],
    );
    this.outstanding.set(out?.cents ?? 0);
    const cr = await this.data.one<{ cents: number }>(
      'SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM credit_ledger WHERE customer_id = ?',
      [id],
    );
    this.credit.set(cr?.cents ?? 0);
  }
}
