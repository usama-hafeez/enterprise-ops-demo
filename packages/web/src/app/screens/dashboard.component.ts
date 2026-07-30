import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { StatCardComponent, StatusBadgeComponent } from '../ui';

interface Kpis {
  openRequisitions: number;
  openBackorders: number;
  backorderUnits: number;
  outstandingCents: number;
  stockUnits: number;
  stockValueCents: number;
  customers: number;
  products: number;
}

interface RecentReq {
  id: number;
  ref: string;
  customer: string;
  status: string;
  created_at: string;
  lines: number;
}

interface TopInvoice {
  id: number;
  number: string;
  customer: string;
  status: string;
  outstanding: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatCardComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Dashboard</h1>
      <p>Laptop spare parts operations at a glance.</p>
    </header>

    @if (kpis(); as k) {
      <div class="stat-row">
        <app-stat [value]="k.openRequisitions.toLocaleString()" label="Open requisitions" />
        <app-stat
          [value]="k.openBackorders.toLocaleString()"
          label="Open backorders"
          [note]="k.backorderUnits.toLocaleString() + ' units waiting'"
        />
        <app-stat [value]="compact(k.outstandingCents)" label="Outstanding receivables" />
        <app-stat
          [value]="k.stockUnits.toLocaleString()"
          label="Units in stock"
          [note]="compact(k.stockValueCents) + ' at cost'"
        />
        <app-stat [value]="k.customers.toLocaleString()" label="Customers" />
        <app-stat [value]="k.products.toLocaleString()" label="Catalogue parts" />
      </div>

      <div class="two-col">
        <section class="card">
          <h2>Recent requisitions</h2>
          <table class="grid">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Lines</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of recent(); track r.id) {
                <tr>
                  <td><a [routerLink]="['/requisitions', r.id]">{{ r.ref }}</a></td>
                  <td>{{ r.customer }}</td>
                  <td class="num">{{ r.lines }}</td>
                  <td><app-status [value]="r.status" /></td>
                </tr>
              }
            </tbody>
          </table>
          <a class="card-link" routerLink="/requisitions">All requisitions</a>
        </section>

        <section class="card">
          <h2>Largest outstanding invoices</h2>
          <table class="grid">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th class="num">Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of topInvoices(); track inv.id) {
                <tr>
                  <td><a [routerLink]="['/invoices', inv.id]">{{ inv.number }}</a></td>
                  <td>{{ inv.customer }}</td>
                  <td class="num">{{ inv.outstanding | money }}</td>
                  <td><app-status [value]="inv.status" /></td>
                </tr>
              }
            </tbody>
          </table>
          <a class="card-link" routerLink="/invoices">All invoices</a>
        </section>
      </div>
    } @else {
      <p class="loading">Loading demo data&hellip;</p>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly kpis = signal<Kpis | undefined>(undefined);
  readonly recent = signal<RecentReq[]>([]);
  readonly topInvoices = signal<TopInvoice[]>([]);

  private readonly moneyPipe = new MoneyPipe();
  money(cents: number): string {
    return this.moneyPipe.transform(cents);
  }

  /** Tile-friendly amounts: $19.9M instead of $19,909,606.74. */
  compact(cents: number): string {
    const dollars = cents / 100;
    if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
    if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}k`;
    return this.money(cents);
  }

  async ngOnInit(): Promise<void> {
    const [req, back, ar, stock, customers, products] = await Promise.all([
      this.data.one<{ n: number }>("SELECT COUNT(*) AS n FROM requisitions WHERE status = 'pending'"),
      this.data.one<{ n: number; units: number }>(
        "SELECT COUNT(*) AS n, COALESCE(SUM(qty), 0) AS units FROM backorders WHERE status = 'open'",
      ),
      this.data.one<{ cents: number }>(
        "SELECT COALESCE(SUM(total_cents - amount_paid_cents), 0) AS cents FROM invoices WHERE status IN ('open', 'partial')",
      ),
      this.data.one<{ units: number; value: number }>(
        'SELECT COALESCE(SUM(qty_on_hand), 0) AS units, COALESCE(SUM(qty_on_hand * unit_cost_cents), 0) AS value FROM stock',
      ),
      this.data.one<{ n: number }>('SELECT COUNT(*) AS n FROM customers'),
      this.data.one<{ n: number }>('SELECT COUNT(*) AS n FROM products'),
    ]);
    this.kpis.set({
      openRequisitions: req?.n ?? 0,
      openBackorders: back?.n ?? 0,
      backorderUnits: back?.units ?? 0,
      outstandingCents: ar?.cents ?? 0,
      stockUnits: stock?.units ?? 0,
      stockValueCents: stock?.value ?? 0,
      customers: customers?.n ?? 0,
      products: products?.n ?? 0,
    });

    this.recent.set(
      await this.data.query<RecentReq>(
        `SELECT r.id, r.ref, c.name AS customer, r.status, r.created_at,
                (SELECT COUNT(*) FROM requisition_lines l WHERE l.requisition_id = r.id) AS lines
           FROM requisitions r JOIN customers c ON c.id = r.customer_id
          ORDER BY r.created_at DESC, r.id DESC LIMIT 6`,
      ),
    );
    this.topInvoices.set(
      await this.data.query<TopInvoice>(
        `SELECT i.id, i.number, c.name AS customer, i.status,
                i.total_cents - i.amount_paid_cents AS outstanding
           FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE i.status IN ('open', 'partial')
          ORDER BY outstanding DESC LIMIT 6`,
      ),
    );
  }
}
