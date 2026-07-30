import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../db.service';
import { MoneyPipe } from '../format';
import { PagerComponent } from '../ui';

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  requisitions: number;
  outstanding: number;
}

const PAGE = 25;

@Component({
  selector: 'app-customers-list',
  standalone: true,
  imports: [RouterLink, MoneyPipe, PagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Customers</h1>
      <p>Trade customers buying laptop spare parts.</p>
      <a class="button primary" routerLink="/customers/new">New customer</a>
    </header>

    <div class="toolbar">
      <input
        type="search"
        placeholder="Search by name or email"
        [value]="search()"
        (input)="onSearch($event)"
      />
    </div>

    <table class="grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th class="num">Requisitions</th>
          <th class="num">Outstanding</th>
        </tr>
      </thead>
      <tbody>
        @for (c of rows(); track c.id) {
          <tr>
            <td>
              <a [routerLink]="['/customers', c.id]">{{ c.name }}</a>
            </td>
            <td>{{ c.email }}</td>
            <td class="num">{{ c.requisitions }}</td>
            <td class="num">{{ c.outstanding | money }}</td>
          </tr>
        } @empty {
          <tr>
            <td colspan="4" class="empty">No customers match.</td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager [offset]="offset()" [limit]="pageSize" [total]="total()" (page)="go($event)" />
  `,
})
export class CustomersListComponent implements OnInit {
  private readonly data = inject(DbService);

  readonly pageSize = PAGE;
  readonly rows = signal<CustomerRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly search = signal('');

  ngOnInit(): void {
    void this.load();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.offset.set(0);
    void this.load();
  }

  go(offset: number): void {
    this.offset.set(Math.max(0, offset));
    void this.load();
  }

  private async load(): Promise<void> {
    const like = `%${this.search()}%`;
    const count = await this.data.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM customers WHERE name LIKE ? OR email LIKE ?',
      [like, like],
    );
    this.total.set(count?.n ?? 0);
    this.rows.set(
      await this.data.query<CustomerRow>(
        `SELECT c.id, c.name, c.email,
                (SELECT COUNT(*) FROM requisitions r WHERE r.customer_id = c.id) AS requisitions,
                (SELECT COALESCE(SUM(total_cents - amount_paid_cents), 0)
                   FROM invoices i WHERE i.customer_id = c.id AND i.status IN ('open', 'partial')) AS outstanding
           FROM customers c
          WHERE c.name LIKE ? OR c.email LIKE ?
          ORDER BY c.id LIMIT ${PAGE} OFFSET ?`,
        [like, like, this.offset()],
      ),
    );
  }
}
