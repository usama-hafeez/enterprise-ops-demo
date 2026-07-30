import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { allocateLine } from '@enterprise-ops/core';
import { DbService } from '../db.service';

interface CustomerOption {
  id: number;
  name: string;
}

interface ProductHit {
  id: number;
  sku: string;
  name: string;
  onHand: number;
}

interface DraftLine {
  product: ProductHit;
  qty: number;
}

@Component({
  selector: 'app-requisition-new',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>New requisition</h1>
      <p>
        Submitting runs the real allocation engine: priority stock first, then nearest warehouse,
        then lowest cost - shortfalls become backorders.
      </p>
    </header>

    <div class="card form">
      <label>
        Customer
        <select name="customer" [(ngModel)]="customerId">
          @for (c of customers(); track c.id) {
            <option [value]="c.id">{{ c.name }}</option>
          }
        </select>
      </label>

      <label>
        Add a part
        <input
          type="search"
          placeholder="Type a part name or SKU, e.g. battery"
          [value]="productSearch()"
          (input)="onProductSearch($event)"
        />
      </label>
      @if (hits().length > 0) {
        <ul class="hits">
          @for (hit of hits(); track hit.id) {
            <li>
              <button type="button" (click)="addLine(hit)">
                {{ hit.name }}
                <span class="muted">{{ hit.sku }} &middot; {{ hit.onHand }} on hand</span>
              </button>
            </li>
          }
        </ul>
      }

      @if (draft().length > 0) {
        <table class="grid">
          <thead>
            <tr>
              <th>Part</th>
              <th>SKU</th>
              <th class="num">On hand</th>
              <th class="num">Qty</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (line of draft(); track line.product.id; let i = $index) {
              <tr>
                <td>{{ line.product.name }}</td>
                <td>{{ line.product.sku }}</td>
                <td class="num">{{ line.product.onHand }}</td>
                <td class="num qty-cell">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    [ngModel]="line.qty"
                    (ngModelChange)="setQty(i, $event)"
                    name="qty{{ i }}"
                  />
                </td>
                <td><button type="button" class="link" (click)="removeLine(i)">Remove</button></td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="muted">No lines yet - search for a part above.</p>
      }

      @if (error()) {
        <p class="form-error">{{ error() }}</p>
      }
      <div class="form-actions">
        <button
          class="primary"
          type="button"
          (click)="submit()"
          [disabled]="draft().length === 0 || busy()"
        >
          {{ busy() ? 'Allocating...' : 'Create and allocate' }}
        </button>
        <a class="button" routerLink="/requisitions">Cancel</a>
      </div>
    </div>
  `,
})
export class RequisitionNewComponent implements OnInit {
  private readonly data = inject(DbService);
  private readonly router = inject(Router);

  readonly customers = signal<CustomerOption[]>([]);
  readonly hits = signal<ProductHit[]>([]);
  readonly draft = signal<DraftLine[]>([]);
  readonly productSearch = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  customerId = 1;

  async ngOnInit(): Promise<void> {
    this.customers.set(
      await this.data.query<CustomerOption>('SELECT id, name FROM customers ORDER BY id LIMIT 500'),
    );
  }

  async onProductSearch(event: Event): Promise<void> {
    const term = (event.target as HTMLInputElement).value;
    this.productSearch.set(term);
    if (term.trim().length < 2) {
      this.hits.set([]);
      return;
    }
    const like = `%${term.trim()}%`;
    this.hits.set(
      await this.data.query<ProductHit>(
        `SELECT p.id, p.sku, p.name,
                (SELECT COALESCE(SUM(qty_on_hand), 0) FROM stock st WHERE st.product_id = p.id) AS onHand
           FROM products p WHERE p.name LIKE ? OR p.sku LIKE ?
          ORDER BY p.id LIMIT 8`,
        [like, like],
      ),
    );
  }

  addLine(hit: ProductHit): void {
    if (!this.draft().some((l) => l.product.id === hit.id)) {
      this.draft.update((lines) => [...lines, { product: hit, qty: 1 }]);
    }
    this.hits.set([]);
    this.productSearch.set('');
  }

  setQty(index: number, qty: number): void {
    this.draft.update((lines) =>
      lines.map((l, i) => (i === index ? { ...l, qty: Math.max(1, Number(qty) || 1) } : l)),
    );
  }

  removeLine(index: number): void {
    this.draft.update((lines) => lines.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const count = await this.data.one<{ n: number }>('SELECT COUNT(*) AS n FROM requisitions');
      const ref = `REQ-${String((count?.n ?? 0) + 1).padStart(6, '0')}`;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const { insertId: reqId } = await this.data.run(
        "INSERT INTO requisitions (ref, customer_id, status, created_at) VALUES (?, ?, 'pending', ?)",
        [ref, Number(this.customerId), now],
      );

      let anyBackorder = false;
      for (const line of this.draft()) {
        const { insertId: lineId } = await this.data.run(
          'INSERT INTO requisition_lines (requisition_id, product_id, qty_requested) VALUES (?, ?, ?)',
          [reqId, line.product.id, line.qty],
        );
        const outcome = await allocateLine(
          this.data.db,
          { id: lineId, productId: line.product.id, qtyRequested: line.qty },
          { now },
        );
        if (outcome.backorderQty > 0) anyBackorder = true;
      }
      await this.data.run('UPDATE requisitions SET status = ? WHERE id = ?', [
        anyBackorder ? 'backordered' : 'invoiced',
        reqId,
      ]);
      await this.router.navigate(['/requisitions', reqId]);
    } catch (err) {
      this.error.set(String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
