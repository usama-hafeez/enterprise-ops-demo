/**
 * Digest over the records a pipeline run produces. Each record is hashed with
 * two FNV-1a lanes and combined by modular addition, so the digest is
 * order-insensitive: the naive variant interleaves invoice records with
 * allocations while the optimized variant emits them batch-wise, and both
 * must land on the same value when (and only when) they produced the same
 * set of records. The record count is part of the digest, and no dependency
 * on node:crypto means the same code runs in the browser demo.
 */
export class OutputHasher {
  private sumA = 0;
  private sumB = 0;
  private count = 0;

  add(record: readonly unknown[]): void {
    const s = JSON.stringify(record);
    let a = 0x811c9dc5;
    let b = 0xcbf29ce4;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c, 0x01000197) >>> 0;
    }
    this.sumA = (this.sumA + a) >>> 0;
    this.sumB = (this.sumB + b) >>> 0;
    this.count += 1;
  }

  digest(): string {
    return (
      this.count.toString(16).padStart(8, '0') +
      this.sumA.toString(16).padStart(8, '0') +
      this.sumB.toString(16).padStart(8, '0')
    );
  }
}
