/** Fixed run timestamp so both variants write identical, reproducible rows. */
export const RUN_TS = '2026-07-01 00:00:00';

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Placeholder list for IN () clauses. */
export function ph(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

export function invoiceNumberForRequisition(requisitionId: number): string {
  // Distinct prefix so pipeline invoices can never collide with seeded ones.
  return `INV-R${pad(requisitionId, 6)}`;
}

/** Status a requisition ends on after allocation but before invoicing. */
export function requisitionStatus(anyAllocated: boolean, anyBackordered: boolean): string {
  if (anyAllocated && !anyBackordered) return 'allocated';
  if (anyAllocated && anyBackordered) return 'partial';
  return 'backordered';
}
