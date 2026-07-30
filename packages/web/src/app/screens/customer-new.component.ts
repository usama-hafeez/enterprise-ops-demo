import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DbService } from '../db.service';

@Component({
  selector: 'app-customer-new',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>New customer</h1>
      <p>Session-only: demo data resets on refresh.</p>
    </header>

    <form class="card form" (ngSubmit)="save()">
      <label>
        Name
        <input name="name" required [(ngModel)]="name" placeholder="Customer 0201" />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          required
          [(ngModel)]="email"
          placeholder="customer0201@acme-parts.test"
        />
      </label>
      @if (error()) {
        <p class="form-error">{{ error() }}</p>
      }
      <div class="form-actions">
        <button class="primary" type="submit" [disabled]="!name || !email">Create customer</button>
      </div>
    </form>
  `,
})
export class CustomerNewComponent {
  private readonly data = inject(DbService);
  private readonly router = inject(Router);

  name = '';
  email = '';
  readonly error = signal('');

  async save(): Promise<void> {
    try {
      const { insertId } = await this.data.run(
        'INSERT INTO customers (name, email) VALUES (?, ?)',
        [this.name.trim(), this.email.trim()],
      );
      await this.router.navigate(['/customers', insertId]);
    } catch (err) {
      this.error.set(String(err));
    }
  }
}
