// Core imports from VS Code
import { autorun, IReader } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// Local imports
import {
  ExtrinsicIndicatorObs,
  ExtrinsicIndicatorData,
} from '../../indicator/indicators/extrinsicIndicatorObs';
import { BaseStrategy, StrategySignal, StrategyType, IStrategyState, Trade } from '../baseStrategy';
import type { ExtrinsicStrategyConfig } from '../collections/extrinsicStrategyCollection';

// Extend the ExtrinsicIndicatorData type to include all possible cumulative flow properties
interface ExtendedIndicatorData extends ExtrinsicIndicatorData {
  cumulativeFlow5?: number;
  cumulativeFlow8?: number;
  cumulativeFlow10?: number;
  cumulativeFlow20?: number;
  cumulativeFlow30?: number;
  cumulativeFlow40?: number;
  cumulativeFlow50?: number;
  priceHistory?: number[]; // Add priceHistory property
}

// Constants
const debug = false;
// const MIN_FLOW_THRESHOLD = 1; // Removed constant
const WARM_UP_TICKS = 10; // Number of ticks to wait before starting to trade
const VALID_SYMBOLS = ['SPY', 'QQQ']; // Valid symbols for trading

// Default trend detection constants (used as fallbacks if not in config)
const DEFAULT_MA_PERIOD = 100;
const DEFAULT_SPY_FACTOR_WHEN_HIGHER = 0.5;
const DEFAULT_SPY_FACTOR_WHEN_LOWER = 1.2;

// Add exit reason enum to track why a position was closed
enum ExitReason {
  NONE,
  FLOW_THRESHOLD, // Exited because call/put flow went below threshold
  CUMULATIVE_FLOW, // Exited because cumulative flow changed direction
  TWO_TICK_DROP, // Exited due to rapid price drop (long only)
}

export class ExtrinsicStrategy extends BaseStrategy {
  // Add tick counter for warm-up period
  private tickCounter = 0;

  private readonly indicatorQQQ: ExtrinsicIndicatorObs;
  private readonly indicatorSPY: ExtrinsicIndicatorObs;
  private isSuspended = false;

  // Track the last exit reason and direction to implement re-entry rules
  private lastExitReason: ExitReason = ExitReason.NONE;
  private lastExitDirection: 'LONG' | 'SHORT' | null = null;

  // Update type definition to properly include all necessary data fields
  private latestDataQQQ?: ExtendedIndicatorData;
  private latestDataSPY?: ExtendedIndicatorData;

  // Add these properties to the ExtrinsicStrategy class
  private lastCumulativeValueQQQ?: number;
  private lastCumulativeValueSPY?: number;

  // Price trend tracking properties
  private priceHistoryQQQ: number[] = [];
  private priceHistorySPY: number[] = [];
  private percentChangeHistoryQQQ: number[] = []; // Add percentage change histories
  private percentChangeHistorySPY: number[] = [];
  private qqqMA = 0;
  private spyMA = 0;
  private dynamicSpyFactor = 1.0;

  // Trend detection configuration
  private readonly maPeriod: number;
  private readonly spyFactorWhenHigher: number;
  private readonly spyFactorWhenLower: number;

  private lastTwoTradingPrices: number[] = [];
  private readonly twoTickDropThresholdCents?: number;

  private cooldownTicksAfterLoss: number = 0;
  private cooldownTicksRemaining: number = 0;

  // Add minFlowThreshold property
  private readonly minFlowThreshold: number;

  constructor(
    public readonly config: ExtrinsicStrategyConfig,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(config);

    // Initialize trend detection parameters from config or use defaults
    this.maPeriod = config.indicatorConfig.maPeriod ?? DEFAULT_MA_PERIOD;
    this.spyFactorWhenHigher =
      config.indicatorConfig.spyFactorWhenHigher ?? DEFAULT_SPY_FACTOR_WHEN_HIGHER;
    this.spyFactorWhenLower =
      config.indicatorConfig.spyFactorWhenLower ?? DEFAULT_SPY_FACTOR_WHEN_LOWER;

    // Initialize minFlowThreshold from config, defaulting to 200 if not provided
    this.minFlowThreshold = config.indicatorConfig.minFlowThreshold ?? 200;

    // Add debug output to verify constructor parameters
    if (debug) {
      console.log(`Strategy initialized with:`);
      console.log(`maPeriod: ${this.maPeriod}`);
      console.log(`spyFactorWhenHigher: ${this.spyFactorWhenHigher}`);
      console.log(`spyFactorWhenLower: ${this.spyFactorWhenLower}`);
      console.log(`minFlowThreshold: ${this.minFlowThreshold}`); // Log minFlowThreshold
    }

    // Validate that config.symbol is either 'SPY' or 'QQQ'
    if (!VALID_SYMBOLS.includes(config.symbol)) {
      throw new Error(
        `Invalid symbol: ${config.symbol}. Must be one of: ${VALID_SYMBOLS.join(', ')}`,
      );
    }

    // Create QQQ indicator with expirationIndex: 0
    this.indicatorQQQ = this._register(
      this.instantiationService.createInstance(ExtrinsicIndicatorObs, 'QQQ', {
        maxHistorySize: 100,
        historicalTotalsSize: 60,
        movingAveragePeriod: config.indicatorConfig.movingAveragePeriod,
        expirationIndex: config.trigger,
        tradePriceSize: config.indicatorConfig.tradePriceSize ?? 15,
      }),
    );

    // Create SPY indicator with expirationIndex: 0
    this.indicatorSPY = this._register(
      this.instantiationService.createInstance(ExtrinsicIndicatorObs, 'SPY', {
        maxHistorySize: 100,
        historicalTotalsSize: 60,
        movingAveragePeriod: config.indicatorConfig.movingAveragePeriod,
        expirationIndex: config.trigger,
        tradePriceSize: config.indicatorConfig.tradePriceSize ?? 15,
      }),
    );

    // Register autorun for each indicator
    this._register(autorun(reader => this.processIndicatorUpdate(reader, this.indicatorQQQ)));
    this._register(autorun(reader => this.processIndicatorUpdate(reader, this.indicatorSPY)));

    this.twoTickDropThresholdCents = config.indicatorConfig.twoTickDropThresholdCents;
    this.cooldownTicksAfterLoss = config.indicatorConfig.cooldownTicksAfterLoss ?? 0;
    this.cooldownTicksRemaining = 0;
  }

  // New methods for price trend tracking
  private updatePriceHistory(): void {
    // Get prices from both indicators
    const qqqPrice = this.latestDataQQQ?.price;
    const spyPrice = this.latestDataSPY?.price;

    if (!qqqPrice || !spyPrice) return;

    // Calculate percentage changes if we have previous prices
    if (this.priceHistoryQQQ.length > 0 && this.priceHistorySPY.length > 0) {
      const lastQQQPrice = this.priceHistoryQQQ[this.priceHistoryQQQ.length - 1];
      const lastSPYPrice = this.priceHistorySPY[this.priceHistorySPY.length - 1];

      // Calculate percent changes ((current - previous) / previous)
      const qqqPercentChange = (qqqPrice - lastQQQPrice) / lastQQQPrice;
      const spyPercentChange = (spyPrice - lastSPYPrice) / lastSPYPrice;

      // Add to percent change histories
      this.percentChangeHistoryQQQ.push(qqqPercentChange);
      this.percentChangeHistorySPY.push(spyPercentChange);

      // Keep percent change histories limited to needed size
      if (this.percentChangeHistoryQQQ.length > this.maPeriod) {
        this.percentChangeHistoryQQQ.shift();
      }

      if (this.percentChangeHistorySPY.length > this.maPeriod) {
        this.percentChangeHistorySPY.shift();
      }
    }

    // Add current prices to respective histories
    this.priceHistoryQQQ.push(qqqPrice);
    this.priceHistorySPY.push(spyPrice);

    // Keep histories limited to needed size
    if (this.priceHistoryQQQ.length > this.maPeriod + 1) {
      // +1 to keep one extra for calculating percent change
      this.priceHistoryQQQ.shift();
    }

    if (this.priceHistorySPY.length > this.maPeriod + 1) {
      this.priceHistorySPY.shift();
    }

    // Only calculate MAs when we have enough data
    if (
      this.percentChangeHistoryQQQ.length >= this.maPeriod - 1 &&
      this.percentChangeHistorySPY.length >= this.maPeriod - 1
    ) {
      this.updateMovingAverages();
    }

    if (debug) {
      console.log(
        `Price histories - QQQ: ${this.priceHistoryQQQ.length}, SPY: ${this.priceHistorySPY.length}`,
      );
      console.log(
        `Percent change histories - QQQ: ${this.percentChangeHistoryQQQ.length}, SPY: ${this.percentChangeHistorySPY.length}`,
      );
      console.log(
        `MAs - QQQ: ${this.qqqMA.toFixed(6)}, SPY: ${this.spyMA.toFixed(6)}, Factor: ${this.dynamicSpyFactor.toFixed(
          2,
        )}`,
      );
    }
  }

  private updateMovingAverages(): void {
    // Calculate QQQ MA using percentage changes
    if (this.percentChangeHistoryQQQ.length >= this.maPeriod - 1) {
      const qqqValues = this.percentChangeHistoryQQQ.slice(-(this.maPeriod - 1));
      this.qqqMA = qqqValues.reduce((sum, change) => sum + change, 0) / (this.maPeriod - 1);
    }

    // Calculate SPY MA using percentage changes
    if (this.percentChangeHistorySPY.length >= this.maPeriod - 1) {
      const spyValues = this.percentChangeHistorySPY.slice(-(this.maPeriod - 1));
      this.spyMA = spyValues.reduce((sum, change) => sum + change, 0) / (this.maPeriod - 1);
    }

    // Update dynamic factor based on comparison
    this.updateDynamicFactor();
  }

  private updateDynamicFactor(): void {
    // Compare SPY MA to QQQ MA for percentage changes
    const spyMAIsHigher = this.spyMA > this.qqqMA;

    // Set appropriate factor based on comparison
    this.dynamicSpyFactor = spyMAIsHigher ? this.spyFactorWhenHigher : this.spyFactorWhenLower;

    if (debug) {
      console.log(
        `Market comparison: SPY percentage change ${spyMAIsHigher ? 'HIGHER' : 'LOWER'} than QQQ, SPY factor: ${this.dynamicSpyFactor.toFixed(
          2,
        )}, Config factors: Higher=${this.spyFactorWhenHigher.toFixed(
          2,
        )}, Lower=${this.spyFactorWhenLower.toFixed(2)}`,
      );
    }
  }

  // Modified processIndicatorUpdate to handle renamed indicators
  private processIndicatorUpdate(reader: IReader, indicator: ExtrinsicIndicatorObs): void {
    const data = indicator.indicatorData$.read(reader);
    if (!data) return;

    // Store the complete data object directly
    if (indicator === this.indicatorQQQ) {
      this.latestDataQQQ = data;
      // Only increment counter on updates from the QQQ indicator to avoid double counting
      if (this.tickCounter < WARM_UP_TICKS) {
        this.tickCounter++;
        debug && console.log(`Warming up: ${this.tickCounter}/${WARM_UP_TICKS}`);
      }
    } else if (indicator === this.indicatorSPY) {
      this.latestDataSPY = data;
    }

    // Only process combined conditions if we have data from both indicators
    if (this.latestDataQQQ && this.latestDataSPY) {
      this.processCombinedIndicators();
    }
  }

  // Modified processCombinedIndicators to apply the dynamic SPY factor and INVERTED logic
  private processCombinedIndicators(): void {
    if (!this.latestDataQQQ || !this.latestDataSPY) return;

    // Get the price from the trading indicator based on config.symbol
    const tradingData = this.config.symbol === 'QQQ' ? this.latestDataQQQ : this.latestDataSPY;
    if (!tradingData.price) return;

    const price = tradingData.price;

    // Update price history for trend detection
    this.updatePriceHistory();
    this.updatePerformanceMetrics(price);

    // --- Update Price History for Two-Tick Drop Check ---
    this.lastTwoTradingPrices.push(price);
    if (this.lastTwoTradingPrices.length > 2) {
      this.lastTwoTradingPrices.shift();
    }
    // --- End Two-Tick Drop Price History Update ---

    // Skip trading logic during warm-up period
    if (this.tickCounter < WARM_UP_TICKS) {
      return;
    }

    // Decrement cooldown if active
    if (this.cooldownTicksRemaining > 0) {
      this.cooldownTicksRemaining--;
      return;
    }

    // Access flow values directly from the indicator data
    const lastCallFlowQQQ = this.latestDataQQQ.callFlow;
    const lastPutFlowQQQ = this.latestDataQQQ.putFlow;
    const lastCallFlowSPY = this.latestDataSPY.callFlow;
    const lastPutFlowSPY = this.latestDataSPY.putFlow;

    // Calculate market conditions based on cumulative flows
    const timestamp = Date.now();
    const cumulativeKey = this.config.indicatorConfig.cumulative ?? 'ALL';

    let cumulativeValueQQQ: number | undefined;
    let cumulativeValueSPY: number | undefined;

    if (cumulativeKey === 'ALL') {
      cumulativeValueQQQ = this.latestDataQQQ.cumulativeFlow;
      cumulativeValueSPY = this.latestDataSPY.cumulativeFlow;
    } else {
      const flowKey = `cumulativeFlow${cumulativeKey}` as keyof ExtendedIndicatorData;
      cumulativeValueQQQ = this.latestDataQQQ[flowKey] as number | undefined;
      cumulativeValueSPY = this.latestDataSPY[flowKey] as number | undefined;
    }

    if (cumulativeValueQQQ === undefined || cumulativeValueSPY === undefined) return;

    // Apply the dynamic SPY factor based on price trend
    const configSpyFactor = this.config.indicatorConfig.spyFactor ?? 1.0;
    const useMovingAverages =
      this.priceHistoryQQQ.length >= this.maPeriod && this.priceHistorySPY.length >= this.maPeriod;

    // Use dynamic factor if we have enough price history, otherwise use config
    const spyFactor = useMovingAverages ? this.dynamicSpyFactor : configSpyFactor;

    // Add debug output to verify factor being used
    if (debug) {
      console.log(`--- Dynamic Factor Debug ---`);
      console.log(
        `maPeriod: ${this.maPeriod}, Current histories: QQQ=${this.priceHistoryQQQ.length}, SPY=${this.priceHistorySPY.length}`,
      );
      console.log(
        `useMovingAverages: ${useMovingAverages}, spyFactorWhenHigher: ${this.spyFactorWhenHigher}, spyFactorWhenLower: ${this.spyFactorWhenLower}`,
      );
      console.log(
        `dynamicSpyFactor: ${this.dynamicSpyFactor}, configSpyFactor: ${configSpyFactor}, USING: ${spyFactor}`,
      );
    }

    const adjustedCumulativeValueSPY = cumulativeValueSPY * spyFactor;

    // Original comparison logic (kept for clarity, but used inversely below)
    const isOriginalBullish = cumulativeValueQQQ >= adjustedCumulativeValueSPY;
    const isOriginalBearish = cumulativeValueQQQ < adjustedCumulativeValueSPY;

    if (debug) {
      console.log(
        `Original Comparison - QQQ: ${cumulativeValueQQQ}, SPY: ${cumulativeValueSPY}, Adjusted SPY: ${adjustedCumulativeValueSPY}, Factor: ${spyFactor}`,
      );
      console.log(`Original Market condition: ${isOriginalBullish ? 'BULLISH' : 'BEARISH'}`);
    }

    // Check call/put flows against threshold
    const callFlowBelowThreshold =
      lastCallFlowQQQ < this.minFlowThreshold || lastCallFlowSPY < this.minFlowThreshold;

    const putFlowBelowThreshold =
      lastPutFlowQQQ < this.minFlowThreshold || lastPutFlowSPY < this.minFlowThreshold;

    const { position } = this.performance;

    // Handle current position if exists
    if (position) {
      const isLong = position.isLong;

      // --- Check for Two-Tick Drop Exit (Long Only) ---
      if (
        isLong &&
        this.twoTickDropThresholdCents !== undefined &&
        this.lastTwoTradingPrices.length === 2
      ) {
        const priceDrop = this.lastTwoTradingPrices[0] - this.lastTwoTradingPrices[1];
        const priceDropCents = priceDrop * 100;
        if (priceDropCents >= this.twoTickDropThresholdCents) {
          debug &&
            console.log(
              `INVERTED: Exiting LONG position - Two-Tick Drop Threshold Met. Drop: ${priceDrop.toFixed(4)} (${priceDropCents.toFixed(2)} cents) >= Threshold: ${this.twoTickDropThresholdCents} cents`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.TWO_TICK_DROP;
          this.lastExitDirection = 'LONG';
          this.emitPerformanceUpdate();
          return;
        }
      }
      // --- End Two-Tick Drop Check ---

      // INVERTED Exit conditions with tracking reasons
      if (isLong) {
        // Exit long if PUT flow drops below threshold (original short exit condition)
        if (putFlowBelowThreshold) {
          debug &&
            console.log(
              `INVERTED: Exiting LONG position - Put flow below threshold: ${lastPutFlowQQQ}, ${lastPutFlowSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.FLOW_THRESHOLD; // Keep reason tied to flow type
          this.lastExitDirection = 'LONG';
          this.emitPerformanceUpdate();
          return;
        }
        // Exit long if original bullish condition is met (QQQ stronger than SPY - original short exit condition)
        else if (isOriginalBullish) {
          debug &&
            console.log(
              `INVERTED: Exiting LONG position - QQQ stronger than SPY (Original Bullish): QQQ=${cumulativeValueQQQ}, SPY=${adjustedCumulativeValueSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'LONG';
          this.emitPerformanceUpdate();
          return;
        }
      } else {
        // isShort
        // Exit short if CALL flow drops below threshold (original long exit condition)
        if (callFlowBelowThreshold) {
          debug &&
            console.log(
              `INVERTED: Exiting SHORT position - Call flow below threshold: ${lastCallFlowQQQ}, ${lastCallFlowSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.FLOW_THRESHOLD; // Keep reason tied to flow type
          this.lastExitDirection = 'SHORT';
          this.emitPerformanceUpdate();
          return;
        }
        // Exit short if original bearish condition is met (QQQ weaker than SPY - original long exit condition)
        else if (isOriginalBearish) {
          debug &&
            console.log(
              `INVERTED: Exiting SHORT position - QQQ weaker than SPY (Original Bearish): QQQ=${cumulativeValueQQQ}, SPY=${adjustedCumulativeValueSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'SHORT';
          this.emitPerformanceUpdate();
          return;
        }
      }
    }
    // No position exists, check if we should enter one (INVERTED LOGIC)
    else {
      // Prevent entry if cooldown is active
      if (this.cooldownTicksRemaining > 0) {
        return;
      }

      // Check if we can enter a long position (use original SHORT conditions)
      const canOpenLong =
        (this.type === StrategyType.LONG || this.type === StrategyType.TWO_WAY) &&
        !putFlowBelowThreshold && // Use put flow check for long entry
        isOriginalBearish && // Enter long when original logic said bearish
        this.canReenterDirection('LONG', isOriginalBearish); // Pass the condition that allows entry

      // Check if we can enter a short position (use original LONG conditions)
      const canOpenShort =
        (this.type === StrategyType.SHORT || this.type === StrategyType.TWO_WAY) &&
        !callFlowBelowThreshold && // Use call flow check for short entry
        isOriginalBullish && // Enter short when original logic said bullish
        this.canReenterDirection('SHORT', isOriginalBullish); // Pass the condition that allows entry

      if (canOpenLong) {
        debug &&
          console.log(
            `INVERTED: Opening LONG position - QQQ weaker than SPY (Original Bearish): QQQ=${cumulativeValueQQQ}, SPY=${adjustedCumulativeValueSPY}`,
          );
        this.handleSignal({
          signal: StrategySignal.BUY,
          price,
          timestamp,
        });
        return;
      }

      if (canOpenShort) {
        debug &&
          console.log(
            `INVERTED: Opening SHORT position - QQQ stronger than SPY (Original Bullish): QQQ=${cumulativeValueQQQ}, SPY=${adjustedCumulativeValueSPY}`,
          );
        this.handleSignal({
          signal: StrategySignal.SELL,
          price,
          timestamp,
        });
        return;
      }
    }
  }

  private updatePerformanceMetrics(price: number): void {
    const unrealizedPnL = this.calculateUnrealizedPnL(price);
    this.storePerformanceSnapshot(price, Date.now(), unrealizedPnL);
  }

  private calculateUnrealizedPnL(currentPrice: number): number {
    const { position } = this.performance;
    if (!position) return 0;

    const { price: entryPrice, isLong } = position;
    return isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  private handleSignal(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    if (this.shouldProcessSuspended()) {
      return;
    }

    if (this.shouldClosePosition(event.signal)) {
      this.closePosition(event.price, event.timestamp);
      this.emitPerformanceUpdate();
      return;
    }

    if (this.canOpenPosition(event.signal)) {
      this.openPosition(event);
      this.emitPerformanceUpdate();
    }
  }

  private shouldProcessSuspended(): boolean {
    return this.isSuspended && this.performance.position !== null;
  }

  private openPosition(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    const { signal, price, timestamp } = event;
    const isBuying = signal === StrategySignal.BUY;
    const adjustedPrice = this.adjustPriceForSlippage(price, isBuying);

    this.storePerformanceSnapshot(price, timestamp, 0);

    this.performance.position = {
      price: adjustedPrice,
      isLong: isBuying,
      entryTime: timestamp,
    };

    this.applyTransactionFee();

    this.storePerformanceSnapshot(price, timestamp, 0);

    if (debug) {
      console.log(`[OPEN] ${isBuying ? 'LONG' : 'SHORT'} at ${adjustedPrice}`);
    }
  }

  private applyTransactionFee(): void {
    for (const metrics of this.performance.metrics.values()) {
      metrics.cumulativePnL -= BaseStrategy.TRANSACTION_FEE;
    }
  }

  private closePosition(currentPrice: number, timestamp: number): void {
    const { position } = this.performance;
    if (!position) return;

    // Store cumulative flow values at exit
    if (this.latestDataQQQ && this.latestDataSPY) {
      const cumulativeKey = this.config.indicatorConfig.cumulative ?? 'ALL';
      const flowKey = `cumulativeFlow${cumulativeKey}` as keyof ExtendedIndicatorData;
      const spyFactor = this.config.indicatorConfig.spyFactor ?? 1.0;

      this.lastCumulativeValueQQQ = this.latestDataQQQ[flowKey] as number | undefined;
      // Store the adjusted SPY value to maintain consistency in calculations
      const rawSPYValue = this.latestDataSPY[flowKey] as number | undefined;
      this.lastCumulativeValueSPY = rawSPYValue !== undefined ? rawSPYValue * spyFactor : undefined;
    }

    const { isLong, price: entryPrice, entryTime } = position;
    const exitPrice = this.adjustPriceForSlippage(currentPrice, !isLong);
    const { netProfit } = this.calculatePositionProfit(exitPrice, entryPrice, isLong);
    const tradeDuration = timestamp - entryTime;
    const trade: Trade = {
      profit: netProfit,
      isWin: netProfit > 0,
      exitPrice,
      entryPrice,
      duration: tradeDuration,
    };

    // Update performance metrics by calling the base method.
    this.updatePerformanceOnTrade(trade);

    this.cleanupPosition(currentPrice, timestamp);
    debug && this.logTradeClose(isLong, exitPrice, netProfit);
  }

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

  private cleanupPosition(currentPrice: number, timestamp: number): void {
    this.storePerformanceSnapshot(currentPrice, timestamp, 0);
    this.performance.position = null;
    this.storePerformanceSnapshot(currentPrice, timestamp, 0);
  }

  private logTradeClose(isLong: boolean, exitPrice: number, netProfit: number): void {
    console.log(
      `[CLOSE] ${isLong ? 'LONG' : 'SHORT'} at ${exitPrice}, Profit: ${netProfit.toFixed(2)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private adjustPriceForSlippage(price: number, _isBuying: boolean): number {
    return price;
  }

  private shouldClosePosition(signal: StrategySignal): boolean {
    const { position } = this.performance;
    if (!position) return false;

    return this.isOppositeDirection(position.isLong, signal === StrategySignal.BUY);
  }

  private canOpenPosition(signal: StrategySignal): boolean {
    if (this.performance.position) return false;

    const intendedDirection = signal === StrategySignal.BUY ? 'LONG' : 'SHORT';

    // Basic direction validation
    return this.isValidStrategyDirection(intendedDirection);
  }

  private isOppositeDirection(isLongPosition: boolean, isBuySignal: boolean): boolean {
    return isLongPosition !== isBuySignal;
  }

  private isValidStrategyDirection(direction: 'LONG' | 'SHORT'): boolean {
    return (
      this.type === StrategyType.TWO_WAY ||
      (this.type === StrategyType.LONG && direction === 'LONG') ||
      (this.type === StrategyType.SHORT && direction === 'SHORT')
    );
  }

  private canReenterDirection(
    direction: 'LONG' | 'SHORT',
    currentMarketAllowsEntry: boolean, // Renamed for clarity - this is the condition allowing entry now
  ): boolean {
    // If no previous exit or different direction, we can enter
    if (this.lastExitDirection !== direction || this.lastExitReason === ExitReason.NONE) {
      debug &&
        console.log(
          `Re-entry allowed for ${direction} - No previous exit in this direction or last exit reason was NONE`,
        );
      return true;
    }

    // For flow threshold exits, we can always re-enter when flow goes back above threshold
    // Note: The threshold check is now inverted in the entry logic (e.g., long entry checks !putFlowBelowThreshold)
    if (this.lastExitReason === ExitReason.FLOW_THRESHOLD) {
      debug &&
        console.log(`Re-entry allowed for ${direction} - Previous exit was due to FLOW_THRESHOLD`);
      return true;
    }

    // For cumulative flow exits, we need opposite market direction (based on original comparison) before re-entering same direction
    if (this.lastExitReason === ExitReason.CUMULATIVE_FLOW) {
      // Example: Exited LONG due to CUMULATIVE_FLOW (inverted logic means original market was BULLISH)
      // We want to re-enter LONG only when the market condition allowing entry (original BEARISH) is true.
      // Example: Exited SHORT due to CUMULATIVE_FLOW (inverted logic means original market was BEARISH)
      // We want to re-enter SHORT only when the market condition allowing entry (original BULLISH) is true.

      // The 'currentMarketAllowsEntry' flag already represents the condition needed to enter.
      // If we exited due to CUMULATIVE_FLOW, we can only re-enter if the market condition is now favorable again.
      if (currentMarketAllowsEntry) {
        debug &&
          console.log(
            `Re-entry allowed for ${direction} - Previous exit was CUMULATIVE_FLOW and market condition now allows entry`,
          );
        // Reset exit reason once conditions for re-entry have been met
        this.lastExitReason = ExitReason.NONE;
        this.lastExitDirection = null;
        return true;
      }
      debug &&
        console.log(
          `Re-entry BLOCKED for ${direction} - Previous exit was CUMULATIVE_FLOW and market condition does not yet allow re-entry.`,
        );
      return false; // Block re-entry until market condition flips back
    }

    // Default case: allow re-entry
    return true;
  }

  protected updatePerformanceOnTrade(trade: Trade): void {
    super.updatePerformanceOnTrade(trade);
    // If the trade was a loss, start cooldown
    if (!trade.isWin && this.cooldownTicksAfterLoss > 0) {
      this.cooldownTicksRemaining = this.cooldownTicksAfterLoss;
    }
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
    this.lastExitReason = ExitReason.NONE;
    this.lastExitDirection = null;
    this.priceHistoryQQQ = [];
    this.priceHistorySPY = [];
    this.percentChangeHistoryQQQ = []; // Reset percentage change histories
    this.percentChangeHistorySPY = [];
    this.qqqMA = 0;
    this.spyMA = 0;
    this.dynamicSpyFactor = 1.0;
    this.lastTwoTradingPrices = [];
    this.cooldownTicksRemaining = 0;

    // Call the base class reset if needed
    // super.reset();
  }
}
