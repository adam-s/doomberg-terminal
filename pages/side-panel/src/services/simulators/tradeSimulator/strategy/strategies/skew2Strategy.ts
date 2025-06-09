// Strategy boilerplate template
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { autorun, IReader } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BaseStrategy, StrategySignal, IStrategyState, StrategyType } from '../baseStrategy';
import { SentimentIndicatorObs } from '../../indicator/indicators/sentimentIndicatorObs';
import type { SentimentIndicatorData } from '../../indicator/indicators/sentimentIndicatorObs';
import type { Skew2StrategyConfig } from '../collections/skew2StrategyCollection';

// Delta bounds for filtering - will be replaced by config values
// const LOWER_BOUND = 10; // Default if not in config
// const UPPER_BOUND = 90; // Default if not in config

export class Skew2Strategy extends BaseStrategy {
  private readonly indicator: SentimentIndicatorObs;
  private currentPrice = 0;
  private tickCounter = 0;
  private readonly WARM_UP_TICKS = 60;

  // Add initialization tracking
  private isInitialized = false;
  private initializationAttempts = 0;
  private readonly MAX_INITIALIZATION_ATTEMPTS = 5;
  private lastError: Error | null = null;

  // New fields for consecutive signal counting
  private _consecutiveCloseSignalCount = 0;
  private _lastPotentialCloseSignal: StrategySignal | null = null;
  private readonly _consecutiveCloseSignalThreshold: number; // New field
  private readonly _totalDifferenceThreshold: number; // New field for totalDifference threshold

  private readonly lowerBound: number;
  private readonly upperBound: number;

  constructor(
    public readonly config: Skew2StrategyConfig,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(config);

    // Use bounds from config or default values
    this.lowerBound = config.indicatorConfig.lowerBound ?? 10;
    this.upperBound = config.indicatorConfig.upperBound ?? 90;
    this._consecutiveCloseSignalThreshold = config.indicatorConfig.consecutiveCloseSignals ?? 4; // Initialize from config, default to 4
    this._totalDifferenceThreshold = config.indicatorConfig.totalDifferenceThreshold ?? 0; // Initialize from config, default to 0

    // Initialize new fields
    this._consecutiveCloseSignalCount = 0;
    this._lastPotentialCloseSignal = null;

    // Pass the full indicatorConfig to SentimentIndicatorObs
    this.indicator = this._register(
      this.instantiationService.createInstance(SentimentIndicatorObs, config.symbol, {
        period: config.indicatorConfig.period,
        expirationIndex: config.indicatorConfig.expirationIndex,
        numStrikes: config.indicatorConfig.numStrikes,
        sentimentMaxDeltaMatch: config.indicatorConfig.sentimentMaxDeltaMatch,
        volumeWeight: config.indicatorConfig.volumeWeight,
        normalizeByATM: config.indicatorConfig.normalizeByATM,
        sentimentBeta: config.indicatorConfig.sentimentBeta,
      }),
    );

    // Register autorun with proper error handling
    this._register(
      autorun(reader => {
        try {
          this.processIndicatorUpdate(reader);
        } catch (error) {
          this.handleError(error);
        }
      }),
    );
  }

  private handleError(error: unknown): void {
    // Log the error but prevent it from crashing the strategy
    this.lastError = error instanceof Error ? error : new Error(String(error));
    console.warn(`Error in Skew2Strategy (${this.config.id}): ${this.lastError.message}`);

    // Try to reinitialize if we haven't reached max attempts
    if (this.initializationAttempts < this.MAX_INITIALIZATION_ATTEMPTS) {
      this.initializationAttempts++;
      console.log(
        `Attempting to recover Skew2Strategy (${this.config.id}) - attempt ${this.initializationAttempts}`,
      );
    }
  }

  private processIndicatorUpdate(reader: IReader): void {
    const indicatorData = this.indicator.indicatorData$.read(reader) as
      | SentimentIndicatorData
      | undefined;

    if (
      !indicatorData ||
      indicatorData.symbol !== this.symbol ||
      indicatorData.price === undefined ||
      !Array.isArray(indicatorData.pairedOptions)
    ) {
      return;
    }

    let totalDifference = 0;

    for (const option of indicatorData.pairedOptions) {
      const callDeltaOk =
        typeof option.callDelta === 'number' &&
        option.callDelta * 100 >= this.lowerBound &&
        option.callDelta * 100 <= this.upperBound;
      const putDeltaOk =
        typeof option.putDelta === 'number' &&
        (1 + option.putDelta) * 100 >= this.lowerBound &&
        (1 + option.putDelta) * 100 <= this.upperBound;

      if (
        callDeltaOk &&
        putDeltaOk &&
        typeof option.callIV === 'number' &&
        typeof option.putIV === 'number'
      ) {
        // Simple difference: Put IV - Call IV
        // This assumes we are comparing IVs at similar "moneyness" or delta points.
        // For a more direct comparison without interpolation, we'd ideally want options with the exact same absolute delta.
        // However, given the input structure, we'll sum the differences of paired options that both meet their respective delta criteria.
        // A positive difference suggests puts are more expensive (bearish), negative suggests calls are (bullish).
        // The original logic's `totalDifference > 0` for BUY (red line above green) implied (Put IV - Call IV) > 0.
        // So, if Put IV > Call IV, it's a BUY signal.
        totalDifference += option.putIV - option.callIV;
      }
    }

    // Only process signals after warm-up period
    if (this.tickCounter < this.WARM_UP_TICKS) {
      this.tickCounter++;
      return;
    }

    this.currentPrice = indicatorData.price;
    this.updatePerformanceMetrics(this.currentPrice);

    let signalDecision: StrategySignal | undefined;

    if (totalDifference < -this._totalDifferenceThreshold) {
      signalDecision = StrategySignal.BUY; // Puts are more expensive relative to calls
    } else if (totalDifference > this._totalDifferenceThreshold) {
      signalDecision = StrategySignal.SELL; // Calls are more expensive relative to puts
    } else {
      // No clear signal if the difference is zero or within the threshold
      this.emitPerformanceUpdate(); // Ensure UI updates even with no trade signal
      return;
    }

    this.handleSignal({
      signal: signalDecision,
      price: this.currentPrice,
      timestamp: Date.now(),
    });
  }

  private updatePerformanceMetrics(price: number): void {
    const unrealizedPnL = this.calculateUnrealizedPnL(price);
    this.storePerformanceSnapshot(price, Date.now(), unrealizedPnL);
  }

  private calculateUnrealizedPnL(currentPrice: number): number {
    const { position } = this.performance;
    if (!position) {
      return 0;
    }
    const { price: entryPrice, isLong } = position;
    return isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  private handleSignal(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    const { position } = this.performance;
    const { signal, price, timestamp } = event;

    // Reset consecutive counter if signal is HOLD
    if (signal === StrategySignal.HOLD) {
      this._consecutiveCloseSignalCount = 0;
      this._lastPotentialCloseSignal = null;
      this.emitPerformanceUpdate();
      return;
    }

    // Handle opening positions
    if (!position) {
      this._consecutiveCloseSignalCount = 0; // Reset counter when opening a new position
      this._lastPotentialCloseSignal = null;
      if (
        (this.config.type === StrategyType.LONG && signal === StrategySignal.BUY) ||
        (this.config.type === StrategyType.SHORT && signal === StrategySignal.SELL) ||
        (this.config.type === StrategyType.TWO_WAY &&
          (signal === StrategySignal.BUY || signal === StrategySignal.SELL))
      ) {
        this.openPosition(event);
      }
    }
    // Handle closing positions
    else {
      const isClosingSignalForLong = position.isLong && signal === StrategySignal.SELL;
      const isClosingSignalForShort = !position.isLong && signal === StrategySignal.BUY;

      if (isClosingSignalForLong || isClosingSignalForShort) {
        // This signal is a potential closing signal for the current position
        if (this._lastPotentialCloseSignal === signal) {
          this._consecutiveCloseSignalCount++;
        } else {
          // New type of potential closing signal or first potential closing signal in a sequence
          this._lastPotentialCloseSignal = signal;
          this._consecutiveCloseSignalCount = 1;
        }

        if (this._consecutiveCloseSignalCount >= this._consecutiveCloseSignalThreshold) {
          // Use the threshold here
          this.closePosition(price, timestamp);
          this._consecutiveCloseSignalCount = 0; // Reset after closing
          this._lastPotentialCloseSignal = null;

          // For two-way strategies, open opposite position
          if (this.config.type === StrategyType.TWO_WAY) {
            // The 'signal' here is the one that triggered the close (e.g., SELL if was LONG).
            // We open a new position in the direction of this signal.
            this.openPosition({ signal, price, timestamp });
          }
        }
      } else {
        // Signal is not a closing signal for the current position (e.g., BUY signal while LONG)
        // This breaks any ongoing streak of closing signals.
        this._consecutiveCloseSignalCount = 0;
        this._lastPotentialCloseSignal = null;
      }
    }

    this.emitPerformanceUpdate();
  }

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

  private applyTransactionFee(): void {
    for (const metrics of this.performance.metrics.values()) {
      metrics.cumulativePnL -= BaseStrategy.TRANSACTION_FEE;
    }
  }

  private closePosition(currentPrice: number, timestamp: number): void {
    const { position } = this.performance;
    if (!position) {
      return;
    }

    const { isLong, price: entryPrice, entryTime } = position;
    const { netProfit, isWin } = this.calculatePositionProfit(currentPrice, entryPrice, isLong);
    const tradeDuration = timestamp - entryTime;

    const trade = {
      profit: netProfit,
      isWin,
      exitPrice: currentPrice,
      entryPrice,
      duration: tradeDuration,
    };

    this.updatePerformanceOnTrade(trade);
    this.performance.position = null;
  }

  private calculatePositionProfit(
    exitPrice: number,
    entryPrice: number,
    isLong: boolean,
  ): { profit: number; netProfit: number; isWin: boolean } {
    const profit = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
    const netProfit = profit - BaseStrategy.TRANSACTION_FEE;

    return {
      profit,
      netProfit,
      isWin: netProfit > 0,
    };
  }

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

  public reset(): void {
    this.tickCounter = 0;
    this.currentPrice = 0;
    this.isInitialized = false;
    this.initializationAttempts = 0;
    this.lastError = null;
    // Reset new fields
    this._consecutiveCloseSignalCount = 0;
    this._lastPotentialCloseSignal = null;
  }
}
