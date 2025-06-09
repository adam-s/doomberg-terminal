import {
  BaseStrategy,
  IPerformanceReport,
  IStrategyState,
  StrategySignal,
  Trade,
} from '../baseStrategy';
import type { AggregatedSkewStrategyConfig } from '../collections/aggregateSkewStrategyCollection';
import { StrategyCollection } from '../strategyCollection';

/**
 * Interface for strategies that can handle performance report updates in batch
 */
export interface IPerformanceUpdateHandler {
  onReportsUpdate(reports: IPerformanceReport[]): void;
}

/**
 * Aggregates signals from multiple skew strategies based on their performance.
 * Orders strategies by P/L and uses the top performers to determine position.
 */
export class AggregateSkewStrategy extends BaseStrategy implements IPerformanceUpdateHandler {
  private readonly topPercent: number;
  private readonly requiredConsecutiveSignals: number;
  private readonly requiredConsensusPercent: number;
  private currentPrice = 0;
  private _consecutiveBuySignals = 0;
  private _consecutiveSellSignals = 0;
  private readonly _performanceReports = new Map<string, IPerformanceReport>();
  private _pendingUpdate = false;
  private readonly baseCollections: StrategyCollection[];
  private tickCounter = 0;
  private readonly WARM_UP_TICKS = 20;

  constructor(
    public readonly config: AggregatedSkewStrategyConfig,
    baseCollections: StrategyCollection[],
  ) {
    super(config);
    this.topPercent = config.topPercent;
    this.requiredConsecutiveSignals = config.requiredConsecutiveSignals;
    this.requiredConsensusPercent = config.requiredConsensusPercent;
    this.baseCollections = baseCollections;
    // WARM_UP_TICKS is now hardcoded
  }

  /**
   * Called by the AggregatedSkewStrategyCollection on its batch timer.
   * Stores the latest reports from the base strategies and flags for evaluation.
   */
  public onReportsUpdate(reports: IPerformanceReport[]): void {
    this._performanceReports.clear(); // Clear previous reports
    for (const report of reports) {
      // Store reports by their ID for easy lookup if needed
      this._performanceReports.set(report.id, report);
    }
    this._pendingUpdate = true; // Mark that evaluation is needed
    this.tickCounter++;
  }

  /**
   * Called by the collection to evaluate strategies if needed
   */
  public maybeEvaluate(): void {
    if (!this._pendingUpdate) {
      return; // Nothing to evaluate
    }
    if (this.tickCounter < this.WARM_UP_TICKS) {
      return; // Still warming up
    }
    this._pendingUpdate = false; // Reset flag
    this._evaluateStrategies(); // Perform the evaluation logic
  }

  /**
   * Helper to calculate the median of an array of numbers.
   * Returns 0 if the array is empty or undefined.
   */
  private _calculateMedian(values: number[] | undefined): number {
    if (!values || values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * New consensus algorithm:
   * 1. Order by median trade profit high to low
   * 2. Take top X% performers
   * 3. Calculate percentage of LONG/SHORT signals among top performers
   * 4. If LONG % >= requiredConsensusPercent, signal BUY
   * 5. Else if SHORT % >= requiredConsensusPercent, signal SELL
   * 6. Otherwise, signal HOLD
   */
  private _evaluateStrategies(): void {
    const reports = Array.from(this._performanceReports.values());
    if (reports.length === 0) {
      this.processAggregatedSignal(StrategySignal.HOLD);
      return;
    }
    // Order by median trade profit high to low
    // Assumes IPerformanceReport contains tradeProfits: number[]
    const sorted = reports.slice().sort((a, b) => {
      const medianB = this._calculateMedian(b.tradeProfits);
      const medianA = this._calculateMedian(a.tradeProfits);
      return medianB - medianA;
    });
    // Take top X% (at least 1)
    const count = Math.max(1, Math.floor(sorted.length * this.topPercent));
    const top = sorted.slice(0, count);

    let longCount = 0;
    let shortCount = 0;
    // let flatCount = 0; // Not needed for consensus logic

    for (const r of top) {
      if (r.position?.isLong) {
        longCount++;
      } else if (r.position && !r.position.isLong) {
        shortCount++;
      } else {
        // flatCount++;
      }
    }

    // Calculate average price for reporting
    const validPrices = top.map(r => r.currentPrice).filter(p => typeof p === 'number' && p > 0);
    if (validPrices.length > 0) {
      const priceSum = validPrices.reduce((sum, price) => sum + price, 0);
      const avgPrice = priceSum / validPrices.length;
      if (avgPrice > 0) {
        this.updateCurrentPrice(avgPrice);
      }
    }

    const totalTop = top.length;
    const longPercent = longCount / totalTop;
    const shortPercent = shortCount / totalTop;

    let signal: StrategySignal;
    if (longPercent >= this.requiredConsensusPercent) {
      signal = StrategySignal.BUY;
    } else if (shortPercent >= this.requiredConsensusPercent) {
      signal = StrategySignal.SELL;
    } else {
      signal = StrategySignal.HOLD;
    }

    this.processAggregatedSignal(signal);
  }

  /**
   * Update the current asset price and related performance metrics.
   */
  public updateCurrentPrice(price: number): void {
    if (typeof price !== 'number' || price <= 0) return; // Ignore invalid prices
    this.currentPrice = price;
    const unrealizedPnL = this._calculateUnrealizedPnL(price);
    this.storePerformanceSnapshot(price, Date.now(), unrealizedPnL);
  }

  /**
   * Process an aggregated signal and update position accordingly.
   */
  public processAggregatedSignal(signal: StrategySignal): void {
    const currentTimestamp = Date.now();

    // Update consecutive signal counters
    if (signal === StrategySignal.BUY) {
      this._consecutiveBuySignals++;
      this._consecutiveSellSignals = 0;
    } else if (signal === StrategySignal.SELL) {
      this._consecutiveSellSignals++;
      this._consecutiveBuySignals = 0;
    } else {
      // HOLD signal resets both counters
      this._consecutiveBuySignals = 0;
      this._consecutiveSellSignals = 0;
    }

    const position = this.performance.position;
    // Use the configurable consecutive signals requirement from config
    const requiredSignals = this.requiredConsecutiveSignals;

    if (!position) {
      // Entry logic: require N consecutive signals (from config)
      if (signal === StrategySignal.BUY && this._consecutiveBuySignals >= requiredSignals) {
        this._enterPosition(true, this.currentPrice, currentTimestamp); // Enter long
        this._consecutiveBuySignals = 0; // Reset counter after taking action
      } else if (
        signal === StrategySignal.SELL &&
        this._consecutiveSellSignals >= requiredSignals
      ) {
        this._enterPosition(false, this.currentPrice, currentTimestamp); // Enter short
        this._consecutiveSellSignals = 0; // Reset counter after taking action
      }
    } else {
      // Exit logic: exit on a single counter-signal or HOLD
      if (position.isLong && (signal === StrategySignal.SELL || signal === StrategySignal.HOLD)) {
        this._exitPosition(this.currentPrice, currentTimestamp);
        // Reset counters on exit
        this._consecutiveSellSignals = 0;
        this._consecutiveBuySignals = 0;
      } else if (
        !position.isLong &&
        (signal === StrategySignal.BUY || signal === StrategySignal.HOLD)
      ) {
        this._exitPosition(this.currentPrice, currentTimestamp);
        // Reset counters on exit
        this._consecutiveBuySignals = 0;
        this._consecutiveSellSignals = 0;
      }
    }
  }

  /**
   * Enter a position (long or short).
   */
  private _enterPosition(isLong: boolean, price: number, timestamp: number): void {
    if (price <= 0) {
      console.warn(`[${this.id}] Attempted to enter position with invalid price: ${price}`);
      return; // Don't enter if price is invalid
    }

    this.performance.position = {
      price,
      isLong,
      entryTime: timestamp,
    };

    // BaseStrategy handles PnL tracking through the updatePerformanceOnTrade method
    this.emitStrategyStateChange(); // Notify state change
  }

  /**
   * Exit the current position and record the trade.
   */
  private _exitPosition(price: number, timestamp: number): void {
    const position = this.performance.position;
    if (!position) return;

    if (price <= 0) {
      console.warn(
        `[${this.id}] Attempted to exit position with invalid price: ${price}. Using entry price as fallback.`,
      );
      price = position.price; // Fallback to entry price if exit price is invalid
    }

    const { isLong, price: entryPrice, entryTime } = position;
    // Calculate profit before fees
    const profit = isLong ? price - entryPrice : entryPrice - price;
    // Net profit includes transaction fee (subtracted)
    const netProfit = profit - BaseStrategy.TRANSACTION_FEE;
    const tradeDuration = timestamp - entryTime;

    const trade: Trade = {
      profit: netProfit,
      isWin: netProfit > 0,
      exitPrice: price,
      entryPrice,
      duration: tradeDuration,
    };

    // Use BaseStrategy method to update PnL, trade counts, etc.
    this.updatePerformanceOnTrade(trade);

    // Clear the position
    this.performance.position = null;
    this.emitStrategyStateChange(); // Notify state change
  }

  /**
   * Calculate unrealized PnL based on current price and position.
   */
  private _calculateUnrealizedPnL(currentPrice: number): number {
    const { position } = this.performance;
    if (!position || typeof currentPrice !== 'number' || currentPrice <= 0) return 0;

    const { price: entryPrice, isLong } = position;
    // Calculate raw PnL, don't subtract fees here
    return isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  /**
   * Get the current strategy state.
   */
  public getStrategyState(): Omit<IStrategyState, 'id'> {
    // Leverage BaseStrategy's snapshot buffer for state
    const lastSnap =
      this.bufferCount > 0
        ? this.performanceBuffer[(this.bufferStart + this.bufferCount - 1) % this.MAX_HISTORY]
        : null;

    return {
      // Use snapshot price if available, otherwise current tracked price
      currentPrice: lastSnap?.currentPrice ?? this.currentPrice,
      position: this.performance.position ? { ...this.performance.position } : null,
      lastTrade: this.performance.lastTrade ? { ...this.performance.lastTrade } : undefined,
      metrics: new Map(this.performance.metrics),
    };
  }

  /**
   * Reset the strategy state and signal counters.
   */
  public reset(): void {
    this.currentPrice = 0;
    this._consecutiveBuySignals = 0;
    this._consecutiveSellSignals = 0;
    this._performanceReports.clear();
    this._pendingUpdate = false;
    this.tickCounter = 0;

    // Reset base strategy state (position, PnL, trades, buffer)
    this.performance.position = null;
    this.performance.lastTrade = undefined;

    // Clear performance buffer in BaseStrategy
    this.performanceBuffer.fill(null);
    this.bufferStart = 0;
    this.bufferCount = 0;

    console.log(`[${this.id}] Strategy state reset.`);
    this.emitStrategyStateChange(); // Notify state change
  }

  /**
   * Dispose of resources when the strategy is no longer needed.
   */
  public override dispose(): void {
    // No need to clear intervals here anymore
    super.dispose();
  }
}
