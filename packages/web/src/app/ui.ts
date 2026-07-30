import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Status badge: color + text label together, so state is never conveyed by
 * color alone. Tones map the domain statuses onto a fixed status palette.
 */
const STATUS_TONES: Record<string, string> = {
  pending: 'warn',
  open: 'warn',
  partial: 'serious',
  invoiced: 'good',
  backordered: 'serious',
  paid: 'good',
  fulfilled: 'good',
};

@Component({
  selector: 'app-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge badge-{{ tone() }}">{{ value() }}</span>`,
})
export class StatusBadgeComponent {
  readonly value = input.required<string>();
  readonly tone = computed(() => STATUS_TONES[this.value()] ?? 'neutral');
}

/** KPI stat tile: one number, one label, optional footnote. */
@Component({
  selector: 'app-stat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat">
      <div class="stat-value">{{ value() }}</div>
      <div class="stat-label">{{ label() }}</div>
      @if (note()) {
        <div class="stat-note">{{ note() }}</div>
      }
    </div>
  `,
})
export class StatCardComponent {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly note = input<string>('');
}

/** Offset pager for list screens. */
@Component({
  selector: 'app-pager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pager">
      <button type="button" (click)="page.emit(offset() - limit())" [disabled]="offset() === 0">
        Previous
      </button>
      <span>{{ from() }}&ndash;{{ to() }} of {{ total().toLocaleString() }}</span>
      <button type="button" (click)="page.emit(offset() + limit())" [disabled]="to() >= total()">
        Next
      </button>
    </div>
  `,
})
export class PagerComponent {
  readonly offset = input.required<number>();
  readonly limit = input.required<number>();
  readonly total = input.required<number>();
  readonly page = output<number>();

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + this.limit(), this.total()));
}
