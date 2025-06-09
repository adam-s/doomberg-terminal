import { autorun, IReader } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SentimentIndicatorObs } from '../../indicator/indicators/sentimentIndicatorObs';
import { BaseStrategy, StrategySignal, IStrategyState } from '../baseStrategy';
import type { SentimentStrategyConfig } from '../collections/sentimentStrategyCollection';

/**
 * Strategy class that makes trade decisions based on sentiment data trends
 * Trading rules:
 * - If sentiment SMA is lower than previous period: BUY signal (buy calls, sell puts)
 * - If sentiment SMA is higher than previous period: SELL signal (buy puts, sell calls)
 */
export class SentimentStrategy extends BaseStrategy {
  private readonly indicator: SentimentIndicatorObs;
  private prevSma: number | null = null;
  private currentPrice = 0;
  private tickCounter = 0;
  private readonly WARM_UP_TICKS = 10; // Wait for a few ticks to establish baseline
  private readonly confirmationTicks: number;

  // State for signal confirmation
  private lastSignal: StrategySignal | null = null;
  private consecutiveSignalCount = 0;

  constructor(
    public readonly config: SentimentStrategyConfig,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(config);
    this.confirmationTicks = config.confirmationTicks;
    // Create sentiment indicator with full configuration
    this.indicator = this._register(
      this.instantiationService.createInstance(SentimentIndicatorObs, config.symbol, {
        ...config.indicatorConfig,
        expirationIndex: config.indicatorConfig.expirationIndex,
      }),
    );

    // Register autorun to process indicator updates
    this._register(autorun(reader => this.processIndicatorUpdate(reader)));
  }

  /**
   * Process sentiment indicator updates and determine trade signals
   */
  private processIndicatorUpdate(reader: IReader): void {
    const data = this.indicator.indicatorData$.read(reader);
    if (!data) return;

    // Update current price for performance tracking using the actual price
    if (data.symbol === this.symbol && data.price !== undefined) {
      this.currentPrice = data.price;
      this.updatePerformanceMetrics(data.price);
    }

    // Skip trading logic during warm-up period
    if (this.tickCounter < this.WARM_UP_TICKS) {
      this.tickCounter++;
      return;
    }

    // Check if we have valid SMA data
    if (data.sma10 === undefined || isNaN(data.sma10)) {
      return;
    }

    const currentSma = data.sma10;
    const timestamp = Date.now();

    // First SMA reading, just store it and wait for next update
    if (this.prevSma === null) {
      this.prevSma = currentSma;
      return;
    }

    // Ensure we have a valid price for trade decisions
    if (data.price === undefined) {
      return;
    }

    // Compare current SMA to previous SMA - INVERTED LOGIC
    let currentSignal: StrategySignal | null = null;
    if (currentSma > this.prevSma) {
      // SMA is trending lower -> BUY signal (inverted from original)
      currentSignal = StrategySignal.BUY;
    } else if (currentSma < this.prevSma) {
      // SMA is trending higher -> SELL signal (inverted from original)
      currentSignal = StrategySignal.SELL;
    } // If equal, maintain current position (HOLD)

    // --- Signal Confirmation Logic ---
    if (currentSignal !== null) {
      if (currentSignal === this.lastSignal) {
        this.consecutiveSignalCount++;
      } else {
        this.lastSignal = currentSignal;
        this.consecutiveSignalCount = 1;
      }
      if (this.consecutiveSignalCount >= this.confirmationTicks) {
        this.handleSignal({
          signal: currentSignal,
          price: data.price,
          timestamp,
        });
        // Do not reset count here; requires a change + confirmation ticks to flip again
      }
    } else {
      this.resetSignalConfirmation();
    }

    // Update previous SMA for next comparison
    this.prevSma = currentSma;
  }

  /**
   * Update performance metrics based on current price
   */
  private updatePerformanceMetrics(price: number): void {
    const unrealizedPnL = this.calculateUnrealizedPnL(price);
    this.storePerformanceSnapshot(price, Date.now(), unrealizedPnL);
  }

  /**
   * Calculate unrealized PnL based on current price and position
   */
  private calculateUnrealizedPnL(currentPrice: number): number {
    const { position } = this.performance;
    if (!position) return 0;

    const { price: entryPrice, isLong } = position;
    return isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  /**
   * Handle buy/sell signals from sentiment indicator
   */
  private handleSignal(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    const { position } = this.performance;

    // If we have a position, check if we need to close it
    if (position) {
      const isLong = position.isLong;
      const isBuying = event.signal === StrategySignal.BUY;

      // Close position if signal is opposite to current position
      if (isLong !== isBuying) {
        this.closePosition(event.price, event.timestamp);
        this.emitPerformanceUpdate();

        // Open new position based on the signal
        this.openPosition(event);
        this.emitPerformanceUpdate();
        return;
      }
    } else {
      // No position exists, so open one based on the signal
      this.openPosition(event);
      this.emitPerformanceUpdate();
    }
  }

  /**
   * Open a new position
   */
  private openPosition(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    const { signal, price, timestamp } = event;
    const isBuying = signal === StrategySignal.BUY;

    this.performance.position = {
      price,
      isLong: isBuying,
      entryTime: timestamp,
    };

    this.applyTransactionFee();
  }

  /**
   * Apply transaction fee when opening position
   */
  private applyTransactionFee(): void {
    for (const metrics of this.performance.metrics.values()) {
      metrics.cumulativePnL -= BaseStrategy.TRANSACTION_FEE;
    }
  }

  /**
   * Close the current position
   */
  private closePosition(currentPrice: number, timestamp: number): void {
    const { position } = this.performance;
    if (!position) return;

    const { isLong, price: entryPrice, entryTime } = position;
    const { netProfit } = this.calculatePositionProfit(currentPrice, entryPrice, isLong);
    const tradeDuration = timestamp - entryTime;

    const trade = {
      profit: netProfit,
      isWin: netProfit > 0,
      exitPrice: currentPrice,
      entryPrice,
      duration: tradeDuration,
    };

    // Update performance metrics by calling the base method
    this.updatePerformanceOnTrade(trade);
    this.performance.position = null;
  }

  /**
   * Calculate position profit
   */
  private calculatePositionProfit(
    exitPrice: number,
    entryPrice: number,
    isLong: boolean,
  ): { profit: number; netProfit: number } {
    const profit = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
    return {
      profit,
      netProfit: profit - BaseStrategy.TRANSACTION_FEE,
    };
  }

  /**
   * Get the current strategy state
   */
  public getStrategyState(): Omit<IStrategyState, 'id'> {
    const currentSnap =
      this.performanceBuffer[(this.bufferStart + this.bufferCount - 1) % this.MAX_HISTORY];
    return {
      currentPrice: currentSnap?.currentPrice ?? 0,
      position: this.performance.position,
      lastTrade: this.performance.lastTrade,
      metrics: new Map(this.performance.metrics),
    };
  }

  /**
   * Reset the strategy state
   */
  public reset(): void {
    this.prevSma = null;
    this.tickCounter = 0;
  }

  /**
   * Reset signal confirmation state
   */
  private resetSignalConfirmation(): void {
    this.lastSignal = null;
    this.consecutiveSignalCount = 0;
  }
}
