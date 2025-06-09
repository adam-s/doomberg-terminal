// Ignore ts and eslint errors in entire file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// Core imports from VS Code
import { autorun, IReader } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// Local imports
import {
  ExtrinsicIndicatorObs,
  ExtrinsicIndicatorData,
} from '../../indicator/indicators/extrinsicIndicatorObs';
import { BaseStrategy, StrategySignal, StrategyType, IStrategyState, Trade } from '../baseStrategy';
import type { ExtrinsicStrategyConfig } from '../extrinsicStrategyCollection';

// Extend the ExtrinsicIndicatorData type to include all possible cumulative flow properties
interface ExtendedIndicatorData extends ExtrinsicIndicatorData {
  cumulativeFlow5?: number;
  cumulativeFlow8?: number;
  cumulativeFlow10?: number;
  cumulativeFlow20?: number;
  cumulativeFlow30?: number;
  cumulativeFlow40?: number;
  cumulativeFlow50?: number;
}

// Constants
const debug = false;
const MIN_FLOW_THRESHOLD = 0; // Minimum flow threshold for trade entry/exit
const WARM_UP_TICKS = 80; // Number of ticks to wait before starting to trade
const VALID_SYMBOLS = ['SPY', 'QQQ']; // Valid symbols for trading

// Add exit reason enum to track why a position was closed
enum ExitReason {
  NONE,
  FLOW_THRESHOLD, // Exited because call/put flow went below threshold
  CUMULATIVE_FLOW, // Exited because cumulative flow changed direction
  TAKE_PROFIT,
  TRAILING_STOP,
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

  // Add tracking properties for trailing widening threshold behavior
  private bestCumulativeValueQQQ?: number;
  private bestCumulativeValueSPY?: number;

  constructor(
    public readonly config: ExtrinsicStrategyConfig,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super(config);

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
        expirationIndex: 0,
        tradePriceSize: config.indicatorConfig.tradePriceSize ?? 15,
      }),
    );

    // Create SPY indicator with expirationIndex: 0
    this.indicatorSPY = this._register(
      this.instantiationService.createInstance(ExtrinsicIndicatorObs, 'SPY', {
        maxHistorySize: 100,
        historicalTotalsSize: 60,
        movingAveragePeriod: config.indicatorConfig.movingAveragePeriod,
        expirationIndex: 0,
        tradePriceSize: config.indicatorConfig.tradePriceSize ?? 15,
      }),
    );

    // Register autorun for each indicator
    this._register(autorun(reader => this.processIndicatorUpdate(reader, this.indicatorQQQ)));
    this._register(autorun(reader => this.processIndicatorUpdate(reader, this.indicatorSPY)));
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

  // Modified processCombinedIndicators to use the correct trading indicator
  private processCombinedIndicators(): void {
    if (!this.latestDataQQQ || !this.latestDataSPY) return;

    // Get the price from the trading indicator based on config.symbol
    const tradingData = this.config.symbol === 'QQQ' ? this.latestDataQQQ : this.latestDataSPY;
    if (!tradingData.price) return;

    const price = tradingData.price;
    this.updatePerformanceMetrics(price);

    // Always process position closures even during warm-up
    if (this.checkPositionClosure(price)) {
      return;
    }

    // Skip trading logic during warm-up period
    if (this.tickCounter < WARM_UP_TICKS) {
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

    // Use config values directly instead of HYSTERESIS object
    const bullishThreshold = this.config.indicatorConfig.bullishThreshold ?? 750;
    const bearishThreshold = this.config.indicatorConfig.bearishThreshold ?? -750;

    const isBullish =
      cumulativeValueQQQ > bullishThreshold && cumulativeValueSPY > bullishThreshold;

    const isBearish =
      cumulativeValueQQQ < bearishThreshold && cumulativeValueSPY < bearishThreshold;

    // Check call/put flows against threshold
    const callFlowBelowThreshold =
      lastCallFlowQQQ < MIN_FLOW_THRESHOLD || lastCallFlowSPY < MIN_FLOW_THRESHOLD;

    const putFlowBelowThreshold =
      lastPutFlowQQQ < MIN_FLOW_THRESHOLD || lastPutFlowSPY < MIN_FLOW_THRESHOLD;

    const { position } = this.performance;

    // Handle current position if exists
    if (position) {
      const isLong = position.isLong;

      // Exit conditions with tracking reasons
      if (isLong) {
        // Exit long if call flow drops below threshold
        if (callFlowBelowThreshold) {
          debug &&
            console.log(
              `Exiting LONG position - Call flow below threshold: ${lastCallFlowQQQ}, ${lastCallFlowSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.FLOW_THRESHOLD;
          this.lastExitDirection = 'LONG';
          this.emitPerformanceUpdate();
          return;
        }
        // Exit long if market becomes bearish (cumulative flow direction change)
        else if (isBearish) {
          debug && console.log(`Exiting LONG position - Market became bearish`);
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'LONG';
          this.emitPerformanceUpdate();
          return;
        }
      } else {
        // Exit short if put flow drops below threshold
        if (putFlowBelowThreshold) {
          debug &&
            console.log(
              `Exiting SHORT position - Put flow below threshold: ${lastPutFlowQQQ}, ${lastPutFlowSPY}`,
            );
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.FLOW_THRESHOLD;
          this.lastExitDirection = 'SHORT';
          this.emitPerformanceUpdate();
          return;
        }
        // Exit short if market becomes bullish (cumulative flow direction change)
        else if (isBullish) {
          debug && console.log(`Exiting SHORT position - Market became bullish`);
          this.closePosition(price, timestamp);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'SHORT';
          this.emitPerformanceUpdate();
          return;
        }
      }
    }
    // No position exists, check if we should enter one
    else {
      // Check if we can enter a long position
      const canOpenLong =
        (this.type === StrategyType.LONG || this.type === StrategyType.TWO_WAY) &&
        !callFlowBelowThreshold &&
        isBullish &&
        this.canReenterDirection('LONG', isBullish);

      // Check if we can enter a short position
      const canOpenShort =
        (this.type === StrategyType.SHORT || this.type === StrategyType.TWO_WAY) &&
        !putFlowBelowThreshold &&
        isBearish &&
        this.canReenterDirection('SHORT', isBearish);

      if (canOpenLong) {
        debug &&
          console.log(`Opening LONG position - Call flows: ${lastCallFlowQQQ}, ${lastCallFlowSPY}`);
        this.handleSignal({
          signal: StrategySignal.BUY,
          price,
          timestamp,
        });
        return;
      }

      if (canOpenShort) {
        debug &&
          console.log(`Opening SHORT position - Put flows: ${lastPutFlowQQQ}, ${lastPutFlowSPY}`);
        this.handleSignal({
          signal: StrategySignal.SELL,
          price,
          timestamp,
        });
        return;
      }
    }
  }

  // Add helper method to determine if we can reenter a position
  private canReenterDirection(
    direction: 'LONG' | 'SHORT',
    currentMarketDirection: boolean,
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
    if (this.lastExitReason === ExitReason.FLOW_THRESHOLD) {
      debug &&
        console.log(`Re-entry allowed for ${direction} - Previous exit was due to FLOW_THRESHOLD`);
      return true;
    }

    // For cumulative flow exits, we need opposite market direction before re-entering same direction
    if (this.lastExitReason === ExitReason.CUMULATIVE_FLOW) {
      // For a long position, we exited because market was bearish, we need it to be bullish to re-enter
      // For a short position, we exited because market was bullish, we need it to be bearish to re-enter
      const directionChanged =
        (direction === 'LONG' && currentMarketDirection) ||
        (direction === 'SHORT' && !currentMarketDirection);

      if (directionChanged) {
        debug &&
          console.log(
            `Re-entry allowed for ${direction} - Previous exit was due to CUMULATIVE_FLOW and market direction changed`,
          );
        // Reset exit reason once conditions for re-entry have been met
        this.lastExitReason = ExitReason.NONE;
        this.lastExitDirection = null;
        return true;
      }
      return false;
    }

    // For take profit or trailing stop exits, require cumulative flows to widen by a minimum threshold
    if (
      this.lastExitReason === ExitReason.TAKE_PROFIT ||
      this.lastExitReason === ExitReason.TRAILING_STOP
    ) {
      // Get current cumulative flow values for comparison
      if (
        !this.latestDataQQQ ||
        !this.latestDataSPY ||
        this.lastCumulativeValueQQQ === undefined ||
        this.lastCumulativeValueSPY === undefined ||
        this.bestCumulativeValueQQQ === undefined ||
        this.bestCumulativeValueSPY === undefined
      ) {
        debug &&
          console.log(`Re-entry allowed for ${direction} - Previous exit values not recorded`);
        return true;
      }

      // Get cumulative flow values
      const cumulativeKey = this.config.indicatorConfig.cumulative ?? 'ALL';
      const flowKey = `cumulativeFlow${cumulativeKey}` as keyof ExtendedIndicatorData;

      const currentCumulativeValueQQQ = this.latestDataQQQ[flowKey] as number | undefined;
      const currentCumulativeValueSPY = this.latestDataSPY[flowKey] as number | undefined;

      if (currentCumulativeValueQQQ === undefined || currentCumulativeValueSPY === undefined) {
        return true;
      }

      // Update best values (trailing threshold behavior)
      if (direction === 'LONG') {
        // For long positions, update best values if we have new highs
        if (currentCumulativeValueQQQ > this.bestCumulativeValueQQQ) {
          this.bestCumulativeValueQQQ = currentCumulativeValueQQQ;
          debug &&
            console.log(
              `Updated best cumulative value for QQQ (LONG): ${currentCumulativeValueQQQ}`,
            );
        }
        if (currentCumulativeValueSPY > this.bestCumulativeValueSPY) {
          this.bestCumulativeValueSPY = currentCumulativeValueSPY;
          debug &&
            console.log(
              `Updated best cumulative value for SPY (LONG): ${currentCumulativeValueSPY}`,
            );
        }
      } else {
        // For short positions, update best values if we have new lows
        if (currentCumulativeValueQQQ < this.bestCumulativeValueQQQ) {
          this.bestCumulativeValueQQQ = currentCumulativeValueQQQ;
          debug &&
            console.log(
              `Updated best cumulative value for QQQ (SHORT): ${currentCumulativeValueQQQ}`,
            );
        }
        if (currentCumulativeValueSPY < this.bestCumulativeValueSPY) {
          this.bestCumulativeValueSPY = currentCumulativeValueSPY;
          debug &&
            console.log(
              `Updated best cumulative value for SPY (SHORT): ${currentCumulativeValueSPY}`,
            );
        }
      }

      // Use a configurable widening threshold (default: 250)
      const requiredWidening = this.config.indicatorConfig.wideningThreshold ?? 250;

      if (direction === 'LONG') {
        if (
          this.bestCumulativeValueQQQ >= this.lastCumulativeValueQQQ + requiredWidening &&
          this.bestCumulativeValueSPY >= this.lastCumulativeValueSPY + requiredWidening &&
          currentCumulativeValueQQQ >= this.lastCumulativeValueQQQ + requiredWidening &&
          currentCumulativeValueSPY >= this.lastCumulativeValueSPY + requiredWidening
        ) {
          debug &&
            console.log(
              `Re-entry allowed for LONG - Previous exit: ${
                this.lastExitReason === ExitReason.TAKE_PROFIT ? 'TAKE_PROFIT' : 'TRAILING_STOP'
              } | Widening threshold met: QQQ ${this.lastCumulativeValueQQQ} -> ${currentCumulativeValueQQQ} (Best: ${
                this.bestCumulativeValueQQQ
              }), SPY ${this.lastCumulativeValueSPY} -> ${currentCumulativeValueSPY} (Best: ${
                this.bestCumulativeValueSPY
              }) | Required widening: ${requiredWidening}`,
            );
          this.lastExitReason = ExitReason.NONE;
          this.lastExitDirection = null;
          return true;
        }
      } else if (direction === 'SHORT') {
        if (
          this.bestCumulativeValueQQQ <= this.lastCumulativeValueQQQ - requiredWidening &&
          this.bestCumulativeValueSPY <= this.lastCumulativeValueSPY - requiredWidening &&
          currentCumulativeValueQQQ <= this.lastCumulativeValueQQQ - requiredWidening &&
          currentCumulativeValueSPY <= this.lastCumulativeValueSPY - requiredWidening
        ) {
          debug &&
            console.log(
              `Re-entry allowed for SHORT - Previous exit: ${
                this.lastExitReason === ExitReason.TAKE_PROFIT ? 'TAKE_PROFIT' : 'TRAILING_STOP'
              } | Widening threshold met: QQQ ${this.lastCumulativeValueQQQ} -> ${currentCumulativeValueQQQ} (Best: ${
                this.bestCumulativeValueQQQ
              }), SPY ${this.lastCumulativeValueSPY} -> ${currentCumulativeValueSPY} (Best: ${
                this.bestCumulativeValueSPY
              }) | Required widening: ${requiredWidening}`,
            );
          this.lastExitReason = ExitReason.NONE;
          this.lastExitDirection = null;
          return true;
        }
      }
      return false;
    }

    // For any other exit reasons, allow re-entry by default
    return true;
  }

  private updatePerformanceMetrics(price: number): void {
    const unrealizedPnL = this.calculateUnrealizedPnL(price);
    this.storePerformanceSnapshot(price, Date.now(), unrealizedPnL);
  }

  private checkPositionClosure(price: number): boolean {
    const timestamp = Date.now();

    if (this.checkTakeProfit(price, timestamp)) {
      this.emitPerformanceUpdate();
      return true;
    }

    if (this.checkTrailingStop(price, timestamp)) {
      this.emitPerformanceUpdate();
      return true;
    }

    return false;
  }

  private calculateUnrealizedPnL(currentPrice: number): number {
    const { position } = this.performance;
    if (!position) return 0;

    const { price: entryPrice, isLong } = position;
    return isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  // Updated checkTakeProfit to set exit reason
  private checkTakeProfit(currentPrice: number, timestamp: number): boolean {
    const { position } = this.performance;
    if (!position) return false;

    const takeProfitAmount = (this.config.indicatorConfig.takeProfitAmount ?? 30) / 100;
    if (takeProfitAmount <= 0) return false;

    const { price: entryPrice, isLong } = position;
    const profitTarget = isLong ? entryPrice + takeProfitAmount : entryPrice - takeProfitAmount;
    const isProfitTargetReached = isLong
      ? currentPrice >= profitTarget
      : currentPrice <= profitTarget;

    if (isProfitTargetReached) {
      debug &&
        console.log(
          `[TAKE PROFIT] ${isLong ? 'LONG' : 'SHORT'} - Entry: ${entryPrice}, Current: ${currentPrice}`,
        );

      this.closePosition(currentPrice, timestamp);
      this.lastExitReason = ExitReason.TAKE_PROFIT;
      this.lastExitDirection = isLong ? 'LONG' : 'SHORT';
      return true;
    }

    return false;
  }

  // Fixed checkTrailingStop to remove unused variable
  private checkTrailingStop(currentPrice: number, timestamp: number): boolean {
    const { position } = this.performance;
    if (!position) return false;

    const stopAmount = this.config.indicatorConfig.trailingStopAmount / 100;
    if (stopAmount <= 0) return false;

    const { isLong, price: entryPrice } = position;

    // Ensure max/min price is initialized
    if (isLong && position.maxPrice === undefined) {
      position.maxPrice = Math.max(entryPrice, currentPrice);
    } else if (!isLong && position.minPrice === undefined) {
      position.minPrice = Math.min(entryPrice, currentPrice);
    }

    // Update trailing stop levels when price moves in favorable direction
    if (isLong) {
      // For long positions, update maxPrice if we have a new high
      if (currentPrice > position.maxPrice!) {
        position.maxPrice = currentPrice;
        debug && console.log(`Updated trailing stop - new high: ${currentPrice}`);
      }
    } else {
      // For short positions, update minPrice if we have a new low
      if (currentPrice < position.minPrice!) {
        position.minPrice = currentPrice;
        debug && console.log(`Updated trailing stop - new low: ${currentPrice}`);
      }
    }

    // Calculate stop level
    const stopLevel = isLong ? position.maxPrice! - stopAmount : position.minPrice! + stopAmount;
    const isStopTriggered = isLong ? currentPrice <= stopLevel : currentPrice >= stopLevel;

    if (isStopTriggered) {
      debug &&
        console.log(
          `[TRAIL STOP] ${isLong ? 'LONG' : 'SHORT'} - Entry: ${entryPrice}, Max/Min: ${
            isLong ? position.maxPrice : position.minPrice
          }, Stop level: ${stopLevel.toFixed(2)}, Current: ${currentPrice}`,
        );

      this.closePosition(currentPrice, timestamp);
      this.lastExitReason = ExitReason.TRAILING_STOP;
      this.lastExitDirection = isLong ? 'LONG' : 'SHORT';
      return true;
    }

    return false;
  }

  private handleSignal(event: { signal: StrategySignal; price: number; timestamp: number }): void {
    if (this.shouldProcessSuspended(event)) {
      return;
    }

    if (this.processTakeProfit(event)) {
      return;
    }

    if (this.processTrailingStop(event)) {
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

  private shouldProcessSuspended(event: { price: number; timestamp: number }): boolean {
    if (this.isSuspended && this.performance.position) {
      if (
        this.checkTakeProfit(event.price, event.timestamp) ||
        this.checkTrailingStop(event.price, event.timestamp)
      ) {
        this.emitPerformanceUpdate();
      }
      return true;
    }
    return false;
  }

  private processTakeProfit(event: { price: number; timestamp: number }): boolean {
    if (this.checkTakeProfit(event.price, event.timestamp)) {
      this.emitPerformanceUpdate();
      return true;
    }
    return false;
  }

  private processTrailingStop(event: { price: number; timestamp: number }): boolean {
    if (this.checkTrailingStop(event.price, event.timestamp)) {
      this.emitPerformanceUpdate();
      return true;
    }
    return false;
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
      maxPrice: isBuying ? adjustedPrice : undefined,
      minPrice: !isBuying ? adjustedPrice : undefined,
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

      this.lastCumulativeValueQQQ = this.latestDataQQQ[flowKey] as number | undefined;
      this.lastCumulativeValueSPY = this.latestDataSPY[flowKey] as number | undefined;

      // Initialize the best values to match exit values
      this.bestCumulativeValueQQQ = this.lastCumulativeValueQQQ;
      this.bestCumulativeValueSPY = this.lastCumulativeValueSPY;
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

    // ...existing cleanup and logging code...
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

  // Simplified canOpenPosition to work with our consolidated logic
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

  // Add a method to reset the strategy state including tick counter and tracking values
  public reset(): void {
    this.tickCounter = 0;
    this.lastExitReason = ExitReason.NONE;
    this.lastExitDirection = null;
    this.bestCumulativeValueQQQ = undefined;
    this.bestCumulativeValueSPY = undefined;

    // Call the base class reset if needed
    // super.reset();
  }
}
