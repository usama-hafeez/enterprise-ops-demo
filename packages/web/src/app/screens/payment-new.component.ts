import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SettlementOutcome, settlePayment } from '@enterprise-ops/core';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';

interface CustomerOption {
  id: number;
  name: string;
  outstanding: number;
}

@Component({
  selector: 'app-payment-new',
  standalone: true,
  imports: [FormsModule, RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Record payment</h1>
      <p>
        Submitting runs the real FIFO settlement engine: oldest invoices first, remainder becomes
        account credit.
      </p>
    </header>

    @if (result(); as r) {
      <div class="card">
        <h2>Payment #{{ r.paymentId }} settled</h2>
        <table class="grid">
          <thead>
            <tr><th>Invoice</th><th class="num">Applied</th></tr>
          </thead>
          <tbody>
            @for (app of r.applications; track app.invoiceId) {
              <tr>
                <td><a [routerLink]="['/invoices', app.invoiceId]">#{{ app.invoiceId }}</a></td>
                <td class="num">{{ app.amountCents | money }}</td>
              </tr>
            } @empty {
              <tr><td colspan="2" class="empty">No open invoices - full amount became credit.</td></tr>
            }
          </tbody>
        </table>
        @if (r.creditCents > 0) {
          <p class="card-note">{{ r.creditCents | money }} booked as account credit.</p>
        }
        <div class="form-actions">
          <a class="button primary" routerLink="/payments">Back to payments</a>
          <button class="button" type="button" (click)="reset()">Record another</button>
        </div>
      </div>
    } @else {
      <form class="card form" (ngSubmit)="submit()">
        <label>
          Customer
          <select name="customer" [(ngModel)]="customerId">
            @for (c of customers(); track c.id) {
              <option [value]="c.id">
                {{ c.name }} ({{ c.outstanding | money }} outstanding)
              </option>
            }
          </select>
        </label>
        <label>
          Amount
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            [(ngModel)]="amount"
            placeholder="150.00"
          />
        </label>
        @if (error()) {
          <p class="form-error">{{ error() }}</p>
        }
        <div class="form-actions">
          <button class="primary" type="submit" [disabled]="!amount || busy()">
            {{ busy() ? 'Settling...' : 'Record and settle' }}
          </button>
          <a class="button" routerLink="/payments">Cancel</a>
        </div>
      </form>
    }
  `,
})
export class PaymentNewComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly customers = signal<CustomerOption[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly result = signal<SettlementOutcome | undefined>(undefined);
  customerId = 1;
  amount: number | null = null;

  async ngOnInit(): Promise<void> {
    this.customers.set(
      await this.data.query<CustomerOption>(
        `SELECT c.id, c.name,
                (SELECT COALESCE(SUM(total_cents - amount_paid_cents), 0) FROM invoices i
                  WHERE i.customer_id = c.id AND i.status IN ('open', 'partial')) AS outstanding
           FROM customers c ORDER BY c.id LIMIT 500`,
      ),
    );
    const preselect = Number(this.route.snapshot.queryParamMap.get('customer'));
    if (preselect) this.customerId = preselect;
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const cents = Math.round((this.amount ?? 0) * 100);
      if (cents <= 0) throw new Error('amount must be positive');
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const { insertId } = await this.data.run(
        'INSERT INTO payments (customer_id, amount_cents, received_at) VALUES (?, ?, ?)',
        [Number(this.customerId), cents, now],
      );
      this.result.set(
        await settlePayment(
          this.data.db,
          { id: insertId, customerId: Number(this.customerId), amountCents: cents },
          { now },
        ),
      );
    } catch (err) {
      this.error.set(String(err));
    } finally {
      this.busy.set(false);
    }
  }

  reset(): void {
    this.result.set(undefined);
    this.amount = null;
  }
}
