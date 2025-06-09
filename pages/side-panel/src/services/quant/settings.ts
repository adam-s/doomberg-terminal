import { Disposable } from 'vs/base/common/lifecycle';
import { observableValue, IObservable, derived } from 'vs/base/common/observable';

export interface StrategySettings {
  movingAveragePeriod: MovingAveragePeriod;
  cumulativeFlowPeriod: CumulativeFlowPeriod;
  bullishThreshold: number;
  bearishThreshold: number;
  takeProfit: number;
  stopLoss: number;
  wideningThreshold: number;
  strategyType: StrategyType;
  symbol: string; // Added symbol property
}
/**
 * Supported moving average periods for options flow analysis
 */
export type MovingAveragePeriod = 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40;

/**
 * Moving average options available for flow analysis
 * Includes values from 5 to 50 with increments of 5
 */
export const MOVING_AVERAGE_OPTIONS: readonly MovingAveragePeriod[] = [
  5, 10, 15, 20, 25, 30, 35, 40,
] as const;

/**
 * Available cumulative flow periods
 */
export type CumulativeFlowPeriod = 8 | 10 | 20;

/**
 * Cumulative flow period options
 */
export const CUMULATIVE_FLOW_OPTIONS: readonly CumulativeFlowPeriod[] = [8, 10, 20] as const;

/**
 * Available stop loss amounts
 */
export type StopLossAmount = 50 | 75 | 100 | 1000;

/**
 * Stop loss options
 */
export const STOP_LOSS_OPTIONS: readonly StopLossAmount[] = [50, 75, 100, 1000] as const;

/**
 * Available take profit amounts
 */
export type TakeProfitAmount = 70 | 80 | 90 | 100 | 1000;

/**
 * Take profit options
 */
export const TAKE_PROFIT_OPTIONS: readonly TakeProfitAmount[] = [70, 80, 90, 100, 1000] as const;

/**
 * Available bullish threshold values
 */
export type BullishThreshold = 0 | 250 | 500 | 750 | 1000 | 2000;

/**
 * Bullish threshold options
 */
export const BULLISH_THRESHOLD_OPTIONS: readonly BullishThreshold[] = [
  0, 250, 500, 750, 1000, 2000,
] as const;

/**
 * Available bearish threshold values
 */
export type BearishThreshold = 0 | -250 | -500 | -750 | -1000 | -2000;

/**
 * Bearish threshold options
 */
export const BEARISH_THRESHOLD_OPTIONS: readonly BearishThreshold[] = [
  0, -250, -500, -750, -1000, -2000,
] as const;

/**
 * Available widening threshold values for re-entry after exits
 */
export type WideningThreshold = 0 | 250 | 500 | 750 | 1000 | 2000;

/**
 * Widening threshold options
 */
export const WIDENING_THRESHOLD_OPTIONS: readonly WideningThreshold[] = [
  0, 250, 500, 750, 1000, 2000,
] as const;

export enum StrategyType {
  LONG = 'LONG',
  SHORT = 'SHORT',
  TWO_WAY = 'TWO_WAY',
}

export class Settings extends Disposable {
  // Define moving average period as an observable
  private readonly _movingAveragePeriod$ = observableValue<MovingAveragePeriod>(
    'movingAveragePeriod',
    MOVING_AVERAGE_OPTIONS[3], // 20
  );
  private readonly _cumulativeFlowPeriod$ = observableValue<CumulativeFlowPeriod>(
    'cumulativeFlowPeriod',
    CUMULATIVE_FLOW_OPTIONS[0], // Default to 8
  );
  // Define stop loss amount as an observable
  private readonly _stopLoss$ = observableValue<number>(
    'stopLoss',
    STOP_LOSS_OPTIONS[3], // Default to 1000
  );
  // Define take profit amount as an observable
  private readonly _takeProfit$ = observableValue<number>(
    'takeProfit',
    TAKE_PROFIT_OPTIONS[0], // Default to 70
  );
  // Define bullish threshold as an observable
  private readonly _bullishThreshold$ = observableValue<number>(
    'bullishThreshold',
    BULLISH_THRESHOLD_OPTIONS[2], // 500
  );
  // Define bearish threshold as an observable
  private readonly _bearishThreshold$ = observableValue<number>(
    'bearishThreshold',
    BEARISH_THRESHOLD_OPTIONS[2], // -500
  );
  // Define strategy type as an observable
  private readonly _strategyType$ = observableValue<StrategyType>(
    'strategyType',
    StrategyType.TWO_WAY, // Default to TWO_WAY
  );
  // Define widening threshold as an observable
  private readonly _wideningThreshold$ = observableValue<number>(
    'wideningThreshold',
    WIDENING_THRESHOLD_OPTIONS[2], // Default to 500
  );
  // Define symbol as an observable
  private readonly _symbol$ = observableValue<string>(
    'symbol',
    'QQQ', // Default to QQQ
  );

  // Only expose the read-only part of the observable
  public readonly movingAveragePeriod$: IObservable<number> = this._movingAveragePeriod$;
  public readonly cumulativeFlowPeriod$: IObservable<number> = this._cumulativeFlowPeriod$;
  public readonly stopLoss$: IObservable<number> = this._stopLoss$;
  public readonly takeProfit$: IObservable<number> = this._takeProfit$;
  public readonly bullishThreshold$: IObservable<number> = this._bullishThreshold$;
  public readonly bearishThreshold$: IObservable<number> = this._bearishThreshold$;
  public readonly strategyType$: IObservable<StrategyType> = this._strategyType$;
  public readonly wideningThreshold$: IObservable<number> = this._wideningThreshold$;
  public readonly symbol$: IObservable<string> = this._symbol$;

  constructor() {
    super();
  }

  /**
   * Updates the moving average period
   * @param value - New moving average period value
   */
  public setMovingAveragePeriod(value: MovingAveragePeriod): void {
    this._movingAveragePeriod$.set(value, undefined);
  }

  /**
   * Updates the cumulative flow period
   * @param value - New cumulative flow period value
   */
  public setCumulativeFlowPeriod(value: CumulativeFlowPeriod): void {
    this._cumulativeFlowPeriod$.set(value, undefined);
  }

  /**
   * Updates the stop loss amount
   * @param value - New stop loss amount
   */
  public setStopLoss(value: number): void {
    this._stopLoss$.set(value, undefined);
  }

  /**
   * Updates the take profit amount
   * @param value - New take profit amount
   */
  public setTakeProfit(value: number): void {
    this._takeProfit$.set(value, undefined);
  }

  /**
   * Updates the bullish threshold
   * @param value - New bullish threshold value
   */
  public setBullishThreshold(value: number): void {
    this._bullishThreshold$.set(value, undefined);
  }

  /**
   * Updates the bearish threshold
   * @param value - New bearish threshold value
   */
  public setBearishThreshold(value: number): void {
    this._bearishThreshold$.set(value, undefined);
  }

  /**
   * Updates the strategy type
   * @param value - New strategy type
   */
  public setStrategyType(value: StrategyType): void {
    this._strategyType$.set(value, undefined);
  }

  /**
   * Updates the widening threshold for re-entry
   * @param value - New widening threshold value
   */
  public setWideningThreshold(value: number): void {
    this._wideningThreshold$.set(value, undefined);
  }

  /**
   * Updates the symbol
   * @param value - New symbol value
   */
  public setSymbol(value: string): void {
    this._symbol$.set(value, undefined);
  }

  /**
   * Returns a consolidated observable that emits when any setting changes
   * Combines all settings into a single object for easier tracking
   */
  public getConsolidatedSettings$(): IObservable<StrategySettings> {
    return derived(reader => {
      const settings = {
        movingAveragePeriod: this._movingAveragePeriod$.read(reader),
        cumulativeFlowPeriod: this._cumulativeFlowPeriod$.read(reader),
        stopLoss: this._stopLoss$.read(reader),
        takeProfit: this._takeProfit$.read(reader),
        bullishThreshold: this._bullishThreshold$.read(reader),
        bearishThreshold: this._bearishThreshold$.read(reader),
        strategyType: this._strategyType$.read(reader),
        wideningThreshold: this._wideningThreshold$.read(reader),
        symbol: this._symbol$.read(reader), // Added symbol to settings
      };
      return settings;
    });
  }

  // Remove the comment and implement a method to check if settings changed
  public hasSettingsChanged(previous: StrategySettings, current: StrategySettings): boolean {
    return (
      previous.movingAveragePeriod !== current.movingAveragePeriod ||
      previous.cumulativeFlowPeriod !== current.cumulativeFlowPeriod ||
      previous.stopLoss !== current.stopLoss ||
      previous.takeProfit !== current.takeProfit ||
      previous.bullishThreshold !== current.bullishThreshold ||
      previous.bearishThreshold !== current.bearishThreshold ||
      previous.wideningThreshold !== current.wideningThreshold ||
      previous.strategyType !== current.strategyType ||
      previous.symbol !== current.symbol // Added symbol comparison
    );
  }

  override dispose(): void {
    // Clean up resources
    super.dispose();
  }
}
