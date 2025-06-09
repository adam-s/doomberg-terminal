import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ExtrinsicIndicatorData, IData } from './data';
import { autorun } from 'vs/base/common/observable';
import { StrategySettings, StrategyType } from './settings';
import { Emitter, Event } from 'vs/base/common/event';
import { ExitReason } from './types';

const debug = true;

export enum StrategySignal {
  BUY = 0,
  SELL = 1,
  HOLD = 2,
}

// Renamed from StrategyPosition to PositionIntent to clarify its purpose
export interface PositionIntent {
  price: number;
  isLong: boolean;
  maxPrice?: number;
  minPrice?: number;
}

const WARM_UP_TICKS = 40;
const SYMBOL = 'QQQ';
const MIN_FLOW_THRESHOLD = 0;

export class Strategy extends Disposable {
  // Update event emitter to include strategy ID and settings
  private readonly _onPositionOpened = this._register(
    new Emitter<{ strategyId: string; settings: StrategySettings }>(),
  );
  public readonly onPositionOpened: Event<{ strategyId: string; settings: StrategySettings }> =
    this._onPositionOpened.event;

  // Updated to include exit reason and strategy ID in the event
  private readonly _onPositionClosed = this._register(
    new Emitter<{ exitReason: ExitReason; strategyId: string }>(),
  );
  public readonly onPositionClosed: Event<{ exitReason: ExitReason; strategyId: string }> =
    this._onPositionClosed.event;

  private tickCounter = 0;
  private lastExitReason: ExitReason = ExitReason.NONE;
  private lastExitDirection: 'LONG' | 'SHORT' | null = null;
  private lastCumulativeValueQQQ?: number;
  private lastCumulativeValueSPY?: number;

  // Changed from position to positionIntent for clarity
  private positionIntent?: PositionIntent;

  /**
   * Gets a unique identifier string for this strategy instance
   * @returns A formatted ID string that captures all relevant settings
   */
  public get id(): string {
    const symbol = SYMBOL; // Using the constant defined in this file
    const {
      movingAveragePeriod,
      stopLoss,
      takeProfit,
      cumulativeFlowPeriod,
      bullishThreshold,
      bearishThreshold,
      wideningThreshold,
      strategyType,
    } = this._settings;

    // Create suffix with all settings parameters
    const suffix = `MA${movingAveragePeriod}-TSL${stopLoss}-TP${takeProfit}-CUM${cumulativeFlowPeriod}-BLT${bullishThreshold}-BRT${Math.abs(bearishThreshold)}-WT${wideningThreshold}`;

    // Return the complete ID with prefix and strategy type
    return `STRATEGY-${symbol}-${strategyType}-${suffix}`;
  }

  constructor(
    private readonly _data: IData,
    private readonly _settings: StrategySettings,
  ) {
    super();
    this._register(this.setupDataHandlers());
  }

  private setupDataHandlers(): IDisposable {
    const period = this._settings.movingAveragePeriod;
    const qqqData$ = this._data.getIndicatorData$('QQQ', period);
    const spyData$ = this._data.getIndicatorData$('SPY', period);

    // Local state to track data changes
    const lastValues = {
      qqqData: undefined as ExtrinsicIndicatorData | undefined,
      spyData: undefined as ExtrinsicIndicatorData | undefined,
    };
    const pending = {
      qqqData: false,
      spyData: false,
    };

    return autorun(reader => {
      const newQQQ = qqqData$?.read(reader);
      const newSPY = spyData$?.read(reader);

      if (newQQQ !== lastValues.qqqData) {
        lastValues.qqqData = newQQQ;
        pending.qqqData = true;
        if (newQQQ && this.tickCounter < WARM_UP_TICKS) {
          this.tickCounter++;
          debug && console.log(`Warming up: ${this.tickCounter}/${WARM_UP_TICKS}`);
        }
      }

      if (newSPY !== lastValues.spyData) {
        lastValues.spyData = newSPY;
        pending.spyData = true;
      }

      // Process data when both are available
      if (pending.qqqData && pending.spyData && newQQQ && newSPY) {
        this.processCombinedIndicators(newQQQ, newSPY);
        pending.qqqData = false;
        pending.spyData = false;
      }
    });
  }

  /**
   * Debug log helper that only logs when debug is enabled
   * @param message The message to log
   */
  private debugLog(message: string): void {
    if (debug) {
      console.log(`[Strategy] ${message}`);
    }
  }

  private processCombinedIndicators(
    latestDataQQQ: ExtrinsicIndicatorData,
    latestDataSPY: ExtrinsicIndicatorData,
  ): void {
    // Get the price from the trading indicator based on symbol
    const tradingData = SYMBOL === 'QQQ' ? latestDataQQQ : latestDataSPY;
    if (!tradingData.price) return;
    const price = tradingData.price;

    // Compute cumulative flow values using static settings
    const cumulativeKey = this._settings.cumulativeFlowPeriod ?? 'ALL';
    const flowKey = `cumulativeFlow${cumulativeKey}` as keyof ExtrinsicIndicatorData;
    const cumulativeValueQQQ = latestDataQQQ[flowKey] as number | undefined;
    const cumulativeValueSPY = latestDataSPY[flowKey] as number | undefined;
    if (cumulativeValueQQQ === undefined || cumulativeValueSPY === undefined) return;

    // Check if we should close an open position first
    if (this.checkPositionClosure(price)) {
      this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
      return;
    }

    // Skip trading logic during warm-up period
    if (this.tickCounter < WARM_UP_TICKS) {
      return;
    }

    // Access flow values directly from the indicator data
    const lastCallFlowQQQ = latestDataQQQ.callFlow;
    const lastPutFlowQQQ = latestDataQQQ.putFlow;
    const lastCallFlowSPY = latestDataSPY.callFlow;
    const lastPutFlowSPY = latestDataSPY.putFlow;

    // Use static config values
    const bullishThreshold = this._settings.bullishThreshold;
    const bearishThreshold = this._settings.bearishThreshold;

    const isBullish =
      cumulativeValueQQQ > bullishThreshold && cumulativeValueSPY > bullishThreshold;
    const isBearish =
      cumulativeValueQQQ < bearishThreshold && cumulativeValueSPY < bearishThreshold;

    // Check call/put flows against threshold
    const callFlowBelowThreshold =
      lastCallFlowQQQ < MIN_FLOW_THRESHOLD || lastCallFlowSPY < MIN_FLOW_THRESHOLD;
    const putFlowBelowThreshold =
      lastPutFlowQQQ < MIN_FLOW_THRESHOLD || lastPutFlowSPY < MIN_FLOW_THRESHOLD;

    // Handle current position if exists
    if (this.positionIntent) {
      const isLong = this.positionIntent.isLong;

      // Exit conditions with tracking reasons
      if (isLong) {
        // Exit long if call flow drops below threshold
        if (callFlowBelowThreshold) {
          this.debugLog(
            `Exiting LONG position - Call flow below threshold: ${lastCallFlowQQQ}, ${lastCallFlowSPY}`,
          );
          this.lastExitReason = ExitReason.FLOW_THRESHOLD;
          this.lastExitDirection = 'LONG';
          this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
          return;
        }
        // Exit long if market becomes bearish (cumulative flow direction change)
        else if (isBearish) {
          this.debugLog(`Exiting LONG position - Market became bearish`);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'LONG';
          this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
          return;
        }
      } else {
        // Exit short if put flow drops below threshold
        if (putFlowBelowThreshold) {
          this.debugLog(
            `Exiting SHORT position - Put flow below threshold: ${lastPutFlowQQQ}, ${lastPutFlowSPY}`,
          );
          this.lastExitReason = ExitReason.FLOW_THRESHOLD;
          this.lastExitDirection = 'SHORT';
          this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
          return;
        }
        // Exit short if market becomes bullish (cumulative flow direction change)
        else if (isBullish) {
          this.debugLog(`Exiting SHORT position - Market became bullish`);
          this.lastExitReason = ExitReason.CUMULATIVE_FLOW;
          this.lastExitDirection = 'SHORT';
          this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
          return;
        }
      }
    }
    // No position exists, check if we should enter one
    else {
      const type = this._settings.strategyType;
      // Check if we can enter a long position
      const canOpenLong =
        (type === StrategyType.LONG || type === StrategyType.TWO_WAY) &&
        !callFlowBelowThreshold &&
        isBullish &&
        this.canReenterDirection('LONG', isBullish, cumulativeValueQQQ, cumulativeValueSPY);

      // Check if we can enter a short position
      const canOpenShort =
        (type === StrategyType.SHORT || type === StrategyType.TWO_WAY) &&
        !putFlowBelowThreshold &&
        isBearish &&
        this.canReenterDirection('SHORT', isBearish, cumulativeValueQQQ, cumulativeValueSPY);

      if (canOpenLong) {
        debug &&
          console.log(
            `[Strategy] Opening LONG position - Price: ${price} | Cumulative flows: QQQ=${cumulativeValueQQQ.toFixed(
              2,
            )}, SPY=${cumulativeValueSPY.toFixed(2)} | Bullish threshold: ${bullishThreshold}`,
          );
        this.handleSignal({
          signal: StrategySignal.BUY,
          price,
        });
        return;
      }

      if (canOpenShort) {
        debug &&
          console.log(
            `[Strategy] Opening SHORT position - Price: ${price} | Cumulative flows: QQQ=${cumulativeValueQQQ.toFixed(
              2,
            )}, SPY=${cumulativeValueSPY.toFixed(2)} | Bearish threshold: ${bearishThreshold}`,
          );
        this.handleSignal({
          signal: StrategySignal.SELL,
          price,
        });
        return;
      }
    }
  }

  // Check if the current position needs to be closed
  private checkPositionClosure(price: number): boolean {
    if (this.checkTakeProfit(price)) {
      return true;
    }
    if (this.checkTrailingStop(price)) {
      return true;
    }
    return false;
  }

  private checkTakeProfit(currentPrice: number): boolean {
    if (!this.positionIntent) return false;
    const takeProfitAmount = this._settings.takeProfit / 100;
    const { price: entryPrice, isLong } = this.positionIntent;
    const profitTarget = isLong ? entryPrice + takeProfitAmount : entryPrice - takeProfitAmount;
    const isProfitTargetReached = isLong
      ? currentPrice >= profitTarget
      : currentPrice <= profitTarget;

    if (isProfitTargetReached) {
      debug &&
        console.log(
          `[TAKE PROFIT] ${isLong ? 'LONG' : 'SHORT'} - Entry: ${entryPrice}, Current: ${currentPrice}, Target: ${profitTarget.toFixed(2)} ($${takeProfitAmount})`,
        );
      this.lastExitReason = ExitReason.TAKE_PROFIT;
      this.lastExitDirection = isLong ? 'LONG' : 'SHORT';
      return true;
    }
    return false;
  }

  private checkTrailingStop(currentPrice: number): boolean {
    const stopAmount = this._settings.stopLoss / 100;
    if (stopAmount <= 0 || !this.positionIntent) return false;
    const { isLong, price: entryPrice } = this.positionIntent;

    if (isLong && this.positionIntent.maxPrice === undefined) {
      this.positionIntent.maxPrice = Math.max(entryPrice, currentPrice);
    } else if (!isLong && this.positionIntent.minPrice === undefined) {
      this.positionIntent.minPrice = Math.min(entryPrice, currentPrice);
    }

    if (isLong) {
      if (currentPrice > this.positionIntent.maxPrice!) {
        this.positionIntent.maxPrice = currentPrice;
        this.debugLog(`Updated trailing stop - new high: ${currentPrice}`);
      }
    } else {
      if (currentPrice < this.positionIntent.minPrice!) {
        this.positionIntent.minPrice = currentPrice;
        this.debugLog(`Updated trailing stop - new low: ${currentPrice}`);
      }
    }

    const stopLevel = isLong
      ? this.positionIntent.maxPrice! - stopAmount
      : this.positionIntent.minPrice! + stopAmount;
    const isStopTriggered = isLong ? currentPrice <= stopLevel : currentPrice >= stopLevel;

    if (isStopTriggered) {
      this.debugLog(
        `[TRAIL STOP] ${isLong ? 'LONG' : 'SHORT'} - Entry: ${entryPrice}, Max/Min: ${
          isLong ? this.positionIntent.maxPrice : this.positionIntent.minPrice
        }, Stop level: ${stopLevel.toFixed(2)} ($${stopAmount}), Current: ${currentPrice}`,
      );
      this.lastExitReason = ExitReason.TRAILING_STOP;
      this.lastExitDirection = isLong ? 'LONG' : 'SHORT';
      return true;
    }
    return false;
  }

  private canReenterDirection(
    direction: 'LONG' | 'SHORT',
    currentMarketDirection: boolean,
    currentCumulativeValueQQQ: number,
    currentCumulativeValueSPY: number,
  ): boolean {
    // If no previous exit or different direction, allow re-entry
    if (this.lastExitDirection !== direction || this.lastExitReason === ExitReason.NONE) {
      this.debugLog(
        `Re-entry allowed for ${direction} - No previous exit in this direction or last exit reason was NONE`,
      );
      return true;
    }
    // For flow threshold exits, allow re-entry immediately once flows recover
    if (this.lastExitReason === ExitReason.FLOW_THRESHOLD) {
      debug &&
        console.log(`Re-entry allowed for ${direction} - Previous exit was due to FLOW_THRESHOLD`);
      return true;
    }
    // For cumulative flow exits, require opposite market direction before re-entry
    if (this.lastExitReason === ExitReason.CUMULATIVE_FLOW) {
      const directionChanged =
        (direction === 'LONG' && currentMarketDirection) ||
        (direction === 'SHORT' && !currentMarketDirection);
      if (directionChanged) {
        this.debugLog(
          `Re-entry allowed for ${direction} - Previous exit was due to CUMULATIVE_FLOW and market direction changed`,
        );
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
      if (this.lastCumulativeValueQQQ === undefined || this.lastCumulativeValueSPY === undefined) {
        this.debugLog(`Re-entry allowed for ${direction} - Previous exit values not recorded`);
        return true;
      }
      const requiredWidening = this._settings.wideningThreshold;
      if (direction === 'LONG') {
        if (
          currentCumulativeValueQQQ >= this.lastCumulativeValueQQQ + requiredWidening &&
          currentCumulativeValueSPY >= this.lastCumulativeValueSPY + requiredWidening
        ) {
          this.debugLog(
            `Re-entry allowed for LONG - Previous exit: ${
              this.lastExitReason === ExitReason.TAKE_PROFIT ? 'TAKE_PROFIT' : 'TRAILING_STOP'
            } | Widening threshold met: QQQ ${
              this.lastCumulativeValueQQQ
            } -> ${currentCumulativeValueQQQ} (Δ ${(
              currentCumulativeValueQQQ - this.lastCumulativeValueQQQ
            ).toFixed(
              2,
            )}), SPY ${this.lastCumulativeValueSPY} -> ${currentCumulativeValueSPY} (Δ ${(
              currentCumulativeValueSPY - currentCumulativeValueSPY
            ).toFixed(2)}) | Required widening: ${requiredWidening}`,
          );
          this.lastExitReason = ExitReason.NONE;
          this.lastExitDirection = null;
          return true;
        }
      } else if (direction === 'SHORT') {
        if (
          currentCumulativeValueQQQ <= this.lastCumulativeValueQQQ - requiredWidening &&
          currentCumulativeValueSPY <= this.lastCumulativeValueSPY - requiredWidening
        ) {
          this.debugLog(
            `Re-entry allowed for SHORT - Previous exit: ${
              this.lastExitReason === ExitReason.TAKE_PROFIT ? 'TAKE_PROFIT' : 'TRAILING_STOP'
            } | Widening threshold met: QQQ ${
              this.lastCumulativeValueQQQ
            } -> ${currentCumulativeValueQQQ} (Δ ${(
              this.lastCumulativeValueQQQ - currentCumulativeValueQQQ
            ).toFixed(
              2,
            )}), SPY ${this.lastCumulativeValueSPY} -> ${currentCumulativeValueSPY} (Δ ${(
              this.lastCumulativeValueSPY - currentCumulativeValueSPY
            ).toFixed(2)}) | Required widening: ${requiredWidening}`,
          );
          this.lastExitReason = ExitReason.NONE;
          this.lastExitDirection = null;
          return true;
        }
      }
      return false;
    }
    // For any other exit reasons, allow re-entry by default
    this.debugLog(
      `Re-entry allowed for ${direction} - No specific re-entry restrictions for exit reason: ${this.lastExitReason}`,
    );
    return true;
  }

  private handleSignal(event: { signal: StrategySignal; price: number }): void {
    // Get current cumulative flow values for possible position closure
    const cumulativeKey = this._settings.cumulativeFlowPeriod ?? 'ALL';
    const flowKey = `cumulativeFlow${cumulativeKey}` as keyof ExtrinsicIndicatorData;

    const maPeriod = this._settings.movingAveragePeriod;
    const latestDataQQQ = this._data.getIndicatorData$('QQQ', maPeriod)?.get();
    const latestDataSPY = this._data.getIndicatorData$('SPY', maPeriod)?.get();

    const cumulativeValueQQQ = latestDataQQQ?.[flowKey] as number | undefined;
    const cumulativeValueSPY = latestDataSPY?.[flowKey] as number | undefined;

    if (this.checkTakeProfit(event.price)) {
      this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
      return;
    }
    if (this.checkTrailingStop(event.price)) {
      this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
      return;
    }
    if (this.shouldClosePosition(event.signal)) {
      this.closePosition(cumulativeValueQQQ, cumulativeValueSPY);
      return;
    }
    if (this.canOpenPosition(event.signal)) {
      this.openPosition(event);
    }
  }

  private openPosition(event: { signal: StrategySignal; price: number }): void {
    const { signal, price } = event;
    const isBuying = signal === StrategySignal.BUY;
    this.positionIntent = {
      price: price,
      isLong: isBuying,
      maxPrice: isBuying ? price : undefined,
      minPrice: !isBuying ? price : undefined,
    };

    // Emit position opened event with strategy ID and settings
    this._onPositionOpened.fire({
      strategyId: this.id,
      settings: this._settings,
    });

    if (debug) {
      const takeProfitAmount = this._settings.takeProfit / 100;
      const stopLossAmount = this._settings.stopLoss / 100;
      const targetPrice = isBuying ? price + takeProfitAmount : price - takeProfitAmount;
      const initialStopLevel = isBuying ? price - stopLossAmount : price + stopLossAmount;
      this.debugLog(
        `[OPEN POSITION INTENT] ${isBuying ? 'LONG' : 'SHORT'} at ${price} | ` +
          `Target: ${targetPrice.toFixed(2)} ($${takeProfitAmount}) | Initial stop: ${initialStopLevel.toFixed(2)} ($${stopLossAmount})`,
      );
    }
  }

  private shouldClosePosition(signal: StrategySignal): boolean {
    if (!this.positionIntent) return false;
    return this.isOppositeDirection(this.positionIntent.isLong, signal === StrategySignal.BUY);
  }

  private isOppositeDirection(isLongPosition: boolean, isBuySignal: boolean): boolean {
    return isLongPosition !== isBuySignal;
  }

  private canOpenPosition(signal: StrategySignal): boolean {
    if (this.positionIntent) return false;
    const intendedDirection = signal === StrategySignal.BUY ? 'LONG' : 'SHORT';
    return this.isValidStrategyDirection(intendedDirection);
  }

  private isValidStrategyDirection(direction: 'LONG' | 'SHORT'): boolean {
    const type = this._settings.strategyType;
    return (
      type === StrategyType.TWO_WAY ||
      (type === StrategyType.LONG && direction === 'LONG') ||
      (type === StrategyType.SHORT && direction === 'SHORT')
    );
  }

  private closePosition(cumulativeValueQQQ?: number, cumulativeValueSPY?: number): void {
    if (!this.positionIntent) return;

    // Get current price from the latest data
    const maPeriod = this._settings.movingAveragePeriod;
    const latestData = this._data.getIndicatorData$(SYMBOL, maPeriod)?.get();
    const exitPrice = latestData?.price;

    if (exitPrice !== undefined) {
      const entryPrice = this.positionIntent.price;
      const priceDiff = this.positionIntent.isLong
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
      const priceDiffPercent = (priceDiff / entryPrice) * 100;

      this.debugLog(
        `[POSITION CLOSED] ${this.positionIntent.isLong ? 'LONG' : 'SHORT'} ` +
          `Entry: $${entryPrice.toFixed(2)} | ` +
          `Exit: $${exitPrice.toFixed(2)} | ` +
          `Diff: $${priceDiff.toFixed(2)} (${priceDiffPercent.toFixed(2)}%) | ` +
          `Reason: ${this.lastExitReason}`,
      );
    }

    // Record the cumulative flow values at the moment of exit if provided
    if (cumulativeValueQQQ !== undefined && cumulativeValueSPY !== undefined) {
      this.lastCumulativeValueQQQ = cumulativeValueQQQ;
      this.lastCumulativeValueSPY = cumulativeValueSPY;
    }

    // Emit position closed event with exit reason and strategy ID before cleaning up
    this._onPositionClosed.fire({ exitReason: this.lastExitReason, strategyId: this.id });

    // @TODO implement close position
    this.cleanupPosition();
  }

  private cleanupPosition() {
    this.positionIntent = undefined;
  }

  /**
   * Checks if the strategy currently has an open position intent
   * @returns true if there is an open position intent, false otherwise
   */
  public hasOpenPositions(): boolean {
    return this.positionIntent !== undefined;
  }

  /**
   * Gets the current position intent if one exists
   * @returns The current position intent or undefined if none exists
   */
  public getPositionIntent(): PositionIntent | undefined {
    return this.positionIntent;
  }

  // For backward compatibility - delegate to getPositionIntent()
  public getPosition(): PositionIntent | undefined {
    return this.getPositionIntent();
  }

  /**
   * Gets the last exit reason
   * @returns The last reason a position was exited
   */
  public getLastExitReason(): ExitReason {
    return this.lastExitReason;
  }

  public async start(): Promise<void> {
    this.debugLog('Strategy started');
  }

  public async stop(): Promise<void> {
    this.debugLog('Strategy stopped');
  }

  public async reset(): Promise<void> {
    await this.stop();
    await this.start();
    this.debugLog('Strategy reset');
  }
}
