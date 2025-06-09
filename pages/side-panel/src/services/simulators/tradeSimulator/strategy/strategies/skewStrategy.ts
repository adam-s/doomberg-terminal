import { autorun, IReader } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SentimentIndicatorObs } from '../../indicator/indicators/sentimentIndicatorObs';
import { BaseStrategy, StrategySignal, IStrategyState, StrategyType } from '../baseStrategy';
import * as skewStrategyCollection from '../collections/skewStrategyCollection';
import type { SentimentIndicatorData } from '../../indicator/indicators/sentimentIndicatorObs';

/**
 * Interface for handling pairedOptions data within the strategy
 * This matches the structure of IPairedOptionData from the indicator
 */
interface PairedOption {
  callDelta: number;
  callIV: number;
  callStrike: string;
  putDelta: number;
  putIV: number;
  putStrike: string;
  deltaMatch: number;
  ivDifference: number;
  liquidity: number | undefined; // Make liquidity optional to match IPairedOptionData
}

/**
 * Strategy class that makes trade decisions based on volatility skew data
 * Trading rules:
 * - If percentage of puts with higher IV than calls increases: SELL signal (bearish)
 * - If percentage of puts with higher IV than calls decreases: BUY signal (bullish)
 * - Price cents filters applied for entry and exit based on config.
 */
export class VolatilitySkewStrategy extends BaseStrategy {
  private readonly indicator: SentimentIndicatorObs;
  private prevSkewPercentage: number | null = null;
  private currentPrice = 0;
  private tickCounter = 0;
  private readonly WARM_UP_TICKS = 10; // Wait for a few ticks to establish baseline
  private readonly requiredConsecutiveSignalsForEntry: number; // Number of consecutive signals needed to enter a position
  private consecutiveBuySignals = 0; // Counter for consecutive buy signals
  private consecutiveSellSignals = 0; // Counter for consecutive sell signals
  private cooldownActive = false;
  private cooldownTicksRemaining = 0;
  private prevPrice: number | null = null;
  private ticksInPosition = 0; // Track ticks in position
  private readonly minPositionHoldTicks: number; // Minimum hold ticks

  // Array of recent skew percentages for smoothing
  private readonly skewHistory: number[] = [];
  // How many samples to use for smoothing the skew percentage (from config or default)
  private readonly smoothingPeriod: number;
  // Minimum change required to generate a signal (from config or default)
  private readonly changeThreshold: number;

  constructor(
    public readonly config: skewStrategyCollection.SkewStrategyConfig,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(config);

    // Initialize configurable parameters with defaults if not provided
    this.smoothingPeriod = config.indicatorConfig.smoothingPeriod || 5;
    this.changeThreshold = config.indicatorConfig.changeThreshold || 1.0;
    this.requiredConsecutiveSignalsForEntry =
      config.indicatorConfig.requiredConsecutiveSignalsForEntry ?? 2;
    this.minPositionHoldTicks = config.indicatorConfig.minPositionHoldTicks ?? 0;

    // Create skew indicator (main)
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
   * Helper to get the cents portion of a price (as a decimal, e.g. 0.23)
   * @param price The price to extract cents from
   * @returns The cents portion as a number between 0.00 and 0.99
   */
  private getPriceCents(price: number): number {
    // Use modulo 1 to get the fractional part, then toFixed(2) to handle precision issues,
    // and convert back to number.
    return +(price % 1).toFixed(2);
  }

  /**
   * Calculate the weight for a given option pair based on the configured weight method
   * @param pair The option pair to calculate weight for
   * @returns The calculated weight (defaults to 1 if no method specified)
   */
  private calculatePairWeight(pair: PairedOption): number {
    const weightMethod = this.config.indicatorConfig.skewWeightMethod;

    // Default to liquidity weighting if not specified
    if (!weightMethod || weightMethod === skewStrategyCollection.SkewWeightMethod.LIQUIDITY) {
      // Safely handle undefined liquidity values
      return typeof pair.liquidity === 'number' && pair.liquidity > 0 ? pair.liquidity : 1;
    }

    if (weightMethod === skewStrategyCollection.SkewWeightMethod.ATM_PROXIMITY) {
      // Weight by how close to ATM (delta = 0.5) the option is
      // The closer to 0.5, the higher the weight
      const callDeltaDiff = Math.abs(Math.abs(pair.callDelta) - 0.5);
      const putDeltaDiff = Math.abs(Math.abs(pair.putDelta) - 0.5);
      const avgDeltaDiff = (callDeltaDiff + putDeltaDiff) / 2;

      // Convert to a weight (1 at delta=0.5, declining as delta moves away)
      return Math.max(1 - avgDeltaDiff, 0.1); // Minimum weight of 0.1
    }

    // SkewWeightMethod.EQUAL or unrecognized method
    return 1;
  }

  /**
   * Determines if an option pair should be included in skew calculation based on delta filters
   * @param pair The option pair to evaluate
   * @returns true if the pair should be included, false otherwise
   */
  private shouldIncludePair(pair: PairedOption): boolean {
    const { minDelta, maxDelta } = this.config.indicatorConfig;

    // If no filters specified, include all pairs
    if (minDelta === undefined && maxDelta === undefined) {
      return true;
    }

    // Get absolute delta values (ignore sign)
    const callDeltaAbs = Math.abs(pair.callDelta);
    const putDeltaAbs = Math.abs(pair.putDelta);

    // Check min delta (if specified)
    if (minDelta !== undefined) {
      if (callDeltaAbs < minDelta || putDeltaAbs < minDelta) {
        return false;
      }
    }

    // Check max delta (if specified)
    if (maxDelta !== undefined) {
      if (callDeltaAbs > maxDelta || putDeltaAbs > maxDelta) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate the percentage of option pairs where put IV exceeds call IV,
   * filtered by delta values and weighted according to configuration
   */
  private calculateSkewPercentage(pairedOptions: PairedOption[] | undefined): number | null {
    if (!Array.isArray(pairedOptions) || pairedOptions.length === 0) {
      return null;
    }

    // Filter pairs by delta values if specified in config
    const filteredPairs = pairedOptions.filter(pair => this.shouldIncludePair(pair));

    // If all pairs are filtered out, return null
    if (filteredPairs.length === 0) {
      return null;
    }

    // Count pairs where putIV > callIV (with appropriate weighting)
    let totalWeight = 0;
    let putsHigherWeight = 0;

    for (const pair of filteredPairs) {
      const weight = this.calculatePairWeight(pair);
      totalWeight += weight;

      if (pair.putIV > pair.callIV) {
        putsHigherWeight += weight;
      }
    }

    // Return as percentage
    return (putsHigherWeight / totalWeight) * 100;
  }

  /**
   * Calculates a smoothed version of the skew percentage using a simple moving average
   * @param currentSkew The current raw skew percentage
   * @returns Smoothed skew percentage
   */
  private calculateSmoothedSkew(currentSkew: number): number {
    // Add the current skew to history
    this.skewHistory.push(currentSkew);

    // Keep only the most recent samples
    if (this.skewHistory.length > this.smoothingPeriod) {
      this.skewHistory.shift();
    }

    // Calculate simple moving average of the skew percentages
    const sum = this.skewHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.skewHistory.length;
  }

  /**
   * Process volatility skew data and determine trade signals
   */
  private processIndicatorUpdate(reader: IReader): void {
    // Cooldown logic: decrement cooldown if active
    if (this.cooldownActive) {
      if (this.cooldownTicksRemaining > 0) {
        this.cooldownTicksRemaining--;
      }
      if (this.cooldownTicksRemaining === 0) {
        this.cooldownActive = false;
      }
    }

    const skewData = this.indicator.indicatorData$.read(reader) as
      | SentimentIndicatorData
      | undefined;

    if (skewData?.symbol === this.symbol && skewData.price !== undefined) {
      const previousTickPrice = this.currentPrice;
      this.currentPrice = skewData.price;
      this.updatePerformanceMetrics(skewData.price);
      const { position } = this.performance;
      const { indicatorConfig } = this.config;
      if (position) {
        this.ticksInPosition++;
        // --- Circuit Breaker: Two-Tick Price Change Exit Logic (Priority) ---
        const twoTickThresholdCents = indicatorConfig.twoTickDropThresholdCents;
        if (
          twoTickThresholdCents !== undefined &&
          this.prevPrice !== null &&
          this.ticksInPosition >= 2
        ) {
          const priceChange = this.currentPrice - this.prevPrice;
          const priceChangeAbs = Math.abs(priceChange);
          if (position.isLong && priceChange < 0 && priceChangeAbs >= twoTickThresholdCents) {
            this.closePosition(this.currentPrice, Date.now());
            this.emitPerformanceUpdate();
            this.prevPrice = previousTickPrice;
            return;
          } else if (
            !position.isLong &&
            priceChange > 0 &&
            priceChangeAbs >= twoTickThresholdCents
          ) {
            this.closePosition(this.currentPrice, Date.now());
            this.emitPerformanceUpdate();
            this.prevPrice = previousTickPrice;
            return;
          }
        }
        // Only allow exit if minimum hold ticks met, and only if exit condition is true now
        if (this.ticksInPosition >= this.minPositionHoldTicks) {
          const cents = this.getPriceCents(skewData.price);
          if (position.isLong) {
            const ceiling = indicatorConfig.exitLongCentsCeiling;
            if (ceiling !== undefined && cents >= ceiling && skewData.price >= position.price) {
              this.closePosition(skewData.price, Date.now());
              this.emitPerformanceUpdate();
              this.prevPrice = previousTickPrice;
              return;
            }
          } else {
            const floor = indicatorConfig.exitShortCentsFloor;
            if (floor !== undefined && cents <= floor && skewData.price <= position.price) {
              this.closePosition(skewData.price, Date.now());
              this.emitPerformanceUpdate();
              this.prevPrice = previousTickPrice;
              return;
            }
          }
        }
      }
      this.prevPrice = previousTickPrice;
    } else {
      this.prevPrice = null;
    }

    if (this.tickCounter < this.WARM_UP_TICKS) {
      this.tickCounter++;
      return;
    }

    if (!skewData || !Array.isArray(skewData.pairedOptions)) {
      this.resetConsecutiveSignals();
      this.prevSkewPercentage = null;
      return;
    }

    const rawSkewPercentage = this.calculateSkewPercentage(
      skewData.pairedOptions as PairedOption[],
    );
    if (rawSkewPercentage === null) {
      this.resetConsecutiveSignals();
      return;
    }

    const currentSkewPercentage = this.calculateSmoothedSkew(rawSkewPercentage);
    const timestamp = Date.now();

    if (this.prevSkewPercentage === null) {
      this.prevSkewPercentage = currentSkewPercentage;
      return;
    }

    if (skewData.price === undefined) {
      return;
    }

    const skewChange = currentSkewPercentage - this.prevSkewPercentage;
    const skewChangeAbs = Math.abs(skewChange);

    if (skewChangeAbs >= this.changeThreshold) {
      if (skewChange > 0) {
        this.handleSignal({
          signal: StrategySignal.SELL,
          price: skewData.price,
          timestamp,
        });
      } else {
        this.handleSignal({
          signal: StrategySignal.BUY,
          price: skewData.price,
          timestamp,
        });
      }
    } else {
      this.resetConsecutiveSignals();
    }

    this.prevSkewPercentage = currentSkewPercentage;
  }

  private resetConsecutiveSignals(): void {
    this.consecutiveBuySignals = 0;
    this.consecutiveSellSignals = 0;
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

    // Update consecutive signal counters
    if (event.signal === StrategySignal.BUY) {
      this.consecutiveBuySignals++;
      this.consecutiveSellSignals = 0;
    } else if (event.signal === StrategySignal.SELL) {
      this.consecutiveSellSignals++;
      this.consecutiveBuySignals = 0;
    }

    // Only allow entry in the direction specified by config.type
    if (!position) {
      if (this.cooldownActive) {
        this.resetConsecutiveSignals();
        return;
      }
      if (
        this.config.type === StrategyType.LONG &&
        event.signal === StrategySignal.BUY &&
        this.consecutiveBuySignals >= this.requiredConsecutiveSignalsForEntry
      ) {
        this.openPosition(event);
        this.emitPerformanceUpdate();
        this.consecutiveBuySignals = 0;
      } else if (
        this.config.type === StrategyType.SHORT &&
        event.signal === StrategySignal.SELL &&
        this.consecutiveSellSignals >= this.requiredConsecutiveSignalsForEntry
      ) {
        this.openPosition(event);
        this.emitPerformanceUpdate();
        this.consecutiveSellSignals = 0;
      }
    } else {
      // Only allow exit if minimum hold ticks met, and only if exit condition is true now
      if (this.ticksInPosition >= this.minPositionHoldTicks) {
        if (position.isLong && event.signal === StrategySignal.SELL) {
          this.closePosition(event.price, event.timestamp);
          this.emitPerformanceUpdate();
          this.consecutiveSellSignals = 0;
        } else if (!position.isLong && event.signal === StrategySignal.BUY) {
          this.closePosition(event.price, event.timestamp);
          this.emitPerformanceUpdate();
          this.consecutiveBuySignals = 0;
        }
      }
    }
  }

  /**
   * Open a new position, applying price cents entry filter
   */
  private openPosition(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    const { signal, price, timestamp } = event;
    const { indicatorConfig } = this.config;
    const cents = this.getPriceCents(price);

    // Only allow opening a position in the allowed direction
    if (
      (this.config.type === StrategyType.LONG && signal !== StrategySignal.BUY) ||
      (this.config.type === StrategyType.SHORT && signal !== StrategySignal.SELL)
    ) {
      if (signal === StrategySignal.BUY) {
        this.consecutiveBuySignals = 0;
      } else if (signal === StrategySignal.SELL) {
        this.consecutiveSellSignals = 0;
      }
      return;
    }

    if (signal === StrategySignal.BUY) {
      const maxCents = indicatorConfig.entryLongCentsMax;
      if (maxCents !== undefined && (cents < 0 || cents > maxCents)) {
        this.consecutiveBuySignals = 0;
        return;
      }
    } else if (signal === StrategySignal.SELL) {
      const minCents = indicatorConfig.entryShortCentsMin;
      if (minCents !== undefined && cents < minCents) {
        this.consecutiveSellSignals = 0;
        return;
      }
    }

    // Price cents filter passed (or not configured), proceed to open position
    const isBuying = signal === StrategySignal.BUY;

    this.performance.position = {
      price,
      isLong: isBuying,
      entryTime: timestamp,
    };

    this.ticksInPosition = 0; // Reset ticks counter on entry
    this.applyTransactionFee();

    // Reset the relevant counter *after* successfully opening the position
    if (isBuying) {
      this.consecutiveBuySignals = 0;
    } else {
      this.consecutiveSellSignals = 0;
    }
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
    this.ticksInPosition = 0; // Reset ticks counter on exit

    // Activate cooldown if trade is a loss and cooldownTicksAfterLoss is set
    const cooldownTicks = this.config.indicatorConfig.cooldownTicksAfterLoss;
    if (!trade.isWin && cooldownTicks !== undefined && cooldownTicks > 0) {
      this.cooldownActive = true;
      this.cooldownTicksRemaining = cooldownTicks;
    }
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
    this.prevSkewPercentage = null;
    this.tickCounter = 0;
    this.skewHistory.length = 0; // Clear the skew history
    this.consecutiveBuySignals = 0; // Reset the buy signals counter
    this.consecutiveSellSignals = 0; // Reset the sell signals counter
    this.cooldownActive = false;
    this.cooldownTicksRemaining = 0;
    this.prevPrice = null;
    this.ticksInPosition = 0;
  }
}

/**
 * Legacy strategy class that is maintained for backward compatibility
 * @deprecated Use VolatilitySkewStrategy instead
 */
export class SkewStrategy extends VolatilitySkewStrategy {
  // This class extends VolatilitySkewStrategy to maintain backward compatibility
}
