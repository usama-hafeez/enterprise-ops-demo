import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DbService } from './db.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-name">Acme Parts</span>
          <span class="brand-sub">laptop spares - ops demo</span>
        </div>
        <nav>
          <div class="nav-group">Overview</div>
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <div class="nav-group">Sales</div>
          <a routerLink="/customers" routerLinkActive="active">Customers</a>
          <a routerLink="/requisitions" routerLinkActive="active">Requisitions</a>
          <a routerLink="/backorders" routerLinkActive="active">Backorders</a>
          <a routerLink="/invoices" routerLinkActive="active">Invoices</a>
          <a routerLink="/payments" routerLinkActive="active">Payments</a>
          <div class="nav-group">Catalogue</div>
          <a routerLink="/products" routerLinkActive="active">Products</a>
          <a routerLink="/manufacturers" routerLinkActive="active">Manufacturers</a>
          <div class="nav-group">Inventory</div>
          <a routerLink="/stock" routerLinkActive="active">Stock</a>
          <a routerLink="/warehouses" routerLinkActive="active">Warehouses</a>
          <a routerLink="/suppliers" routerLinkActive="active">Suppliers</a>
          <div class="nav-group">Tools</div>
          <a routerLink="/export" routerLinkActive="active">CSV export</a>
          <a routerLink="/performance" routerLinkActive="active">Performance</a>
        </nav>
        <div class="sidebar-foot">
          Demo data - synthetic, seeded, session-only. Edits reset on refresh.
        </div>
      </aside>
      <main class="content">
        @if (data.error(); as err) {
          <div class="page-error">Could not load the demo database: {{ err }}</div>
        } @else {
          <router-outlet />
        }
      </main>
    </div>
  `,
})
export class AppComponent implements OnInit {
  readonly data = inject(DbService);

  ngOnInit(): void {
    // Kick the database load immediately so the first screen renders fast.
    void this.data.init().catch(() => undefined);
  }
}
