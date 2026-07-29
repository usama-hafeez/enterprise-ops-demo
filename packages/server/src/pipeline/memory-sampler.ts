/**
 * Samples process RSS on an interval and keeps the maximum. Sampling can miss
 * a short spike between ticks - the README states peak memory is sampled,
 * not exact.
 */
export class MemorySampler {
  private timer: NodeJS.Timeout | undefined;
  private peak = 0;

  start(intervalMs = 25): void {
    this.peak = process.memoryUsage().rss;
    this.timer = setInterval(() => {
      const rss = process.memoryUsage().rss;
      if (rss > this.peak) this.peak = rss;
    }, intervalMs);
    this.timer.unref();
  }

  /** Returns peak RSS in bytes observed since start(). */
  stop(): number {
    if (this.timer) clearInterval(this.timer);
    const rss = process.memoryUsage().rss;
    if (rss > this.peak) this.peak = rss;
    return this.peak;
  }
}
