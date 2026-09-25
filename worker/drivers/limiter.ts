/** Token bucket enforcing the requests/s volume cap. Clock and sleep are injected for tests. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!(perSecond > 0)) throw new Error('perSecond must be > 0');
    this.tokens = perSecond;
    this.last = now();
  }

  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.tokens = Math.min(
        this.perSecond,
        this.tokens + ((t - this.last) / 1000) * this.perSecond,
      );
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.ceil(((1 - this.tokens) / this.perSecond) * 1000));
    }
  }
}
