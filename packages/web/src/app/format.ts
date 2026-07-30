import { Pipe, PipeTransform } from '@angular/core';

/** Integer cents to a display amount: 123456 -> "$1,234.56". */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '-';
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const units = Math.floor(abs / 100).toLocaleString('en-US');
    return `${sign}$${units}.${String(abs % 100).padStart(2, '0')}`;
  }
}
