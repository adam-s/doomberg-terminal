export class MarketHours {
  private static readonly MARKET_START_HOUR = 6;
  private static readonly MARKET_END_HOUR = 20; // 8 PM

  public static isMarketOpen(): boolean {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    return true;
    // Check if it's Monday-Friday (1-5)
    if (day === 0 || day === 6) {
      return false;
    }

    // Check if current hour is between 6 AM and 8 PM
    return hour >= this.MARKET_START_HOUR && hour < this.MARKET_END_HOUR;
  }

  public static getNextMarketOpen(): Date {
    const now = new Date();
    const next = new Date(now);

    // If we're outside of market hours today
    if (now.getHours() >= this.MARKET_END_HOUR) {
      next.setDate(next.getDate() + 1);
    }

    next.setHours(this.MARKET_START_HOUR, 0, 0, 0);

    // If it's weekend, move to Monday
    const day = next.getDay();
    if (day === 0) {
      // Sunday
      next.setDate(next.getDate() + 1);
    } else if (day === 6) {
      // Saturday
      next.setDate(next.getDate() + 2);
    }

    return next;
  }
}
