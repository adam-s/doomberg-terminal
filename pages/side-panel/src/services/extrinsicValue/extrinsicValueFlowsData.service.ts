/**
 * Service for calculating and managing extrinsic value flows for options
 * Provides real-time calculations and historical tracking of option values
 *
 * Key Features:
 * - Calculates extrinsic values from market data
 * - Maintains historical flow data
 * - Computes moving averages and trends
 * - Tracks volume changes and money flows
 */

import { Disposable } from 'vs/base/common/lifecycle';
import {
  derived,
  derivedObservableWithCache,
  IObservable,
  observableValue,
  autorun,
} from 'vs/base/common/observable'; // Added observableValue and autorun
import { IOptionsInstrument, IOptionsMarketData } from '@shared/services/request.types';
import { IOptionDataService } from '../chains/optionData.service';
import {
  MarketDataWithDeltas,
  OptionsFlowAnalytics,
  GroupedOptionsFlow,
  FlowTotalsByExpiration,
  HistoricalFlowTotals,
  AggregatedFlowData,
  CumulativeFlowsByStrike,
  CumulativeFlowsByExpirationAndStrike,
} from './extrinsicValueUtils'; // Keep type imports
import { MarketHours } from '../marketHours';
import { IComputationService } from '@src/side-panel/worker/computation/computationService';

// Define an interface for the expected structure of optionsData.
interface OptionsData {
  marketData: Map<string, IOptionsMarketData>;
  lastTradePrice: number;
  instruments: Record<string, IOptionsInstrument>;
  timestamp?: string;
}

/**
 * Configuration settings for extrinsic value calculations
 * Controls data size and analysis parameters
 */
export interface BaseExtrinsicValueFlowsConfig {
  maxHistorySize: number; // Maximum data points to store
  movingAveragePeriod: number; // Period for MA calculations
  historicalTotalsSize: number; // Size of historical totals array
  tradePriceSize: number; // Maximum number of trade prices for FIFO array
}

export type ExtrinsicValueFlowsConfig = BaseExtrinsicValueFlowsConfig;

/**
 * Default configuration values for extrinsic calculations
 */
const DEFAULT_CONFIG: BaseExtrinsicValueFlowsConfig = {
  maxHistorySize: 500, // Store up to 100 data points
  movingAveragePeriod: 3, // 3-period moving average
  historicalTotalsSize: 30, // Keep 30 historical totals, used for graphing 40 data points
  tradePriceSize: 30, // Use 30 points for price channel calc
};

/**
 * Interface defining the public API for extrinsic value calculations
 * Provides access to real-time and historical data
 */
export interface IExtrinsicValueFlowsData extends Disposable {
  readonly lastUpdateTime$: IObservable<string | undefined>; // Last data update time
  readonly lastTradePrice$: IObservable<number | undefined>; // Current underlying price
  readonly tradePrice$: IObservable<number[] | undefined>; // Current underlying price
  readonly movingAverageData$: IObservable<HistoricalFlowTotals | undefined>; // Smoothed historical data
  readonly historicalFlowTotals$: IObservable<HistoricalFlowTotals | undefined>; // Raw historical data
  readonly intermediateOptionsFlowData$: IObservable<OptionsFlowAnalytics[] | undefined>; // Current flow data
  readonly optionDataService: IOptionDataService; // Underlying data service
  readonly aggregatedFlowData$: IObservable<AggregatedFlowData | undefined>; // Aggregated flow data
  readonly cumulativeFlowsByStrike$: IObservable<CumulativeFlowsByStrike | undefined>;
  readonly cumulativeFlowsByExpirationAndStrike$: IObservable<
    CumulativeFlowsByExpirationAndStrike | undefined
  >;
  start(): Promise<void>; // Initializes calculations
  getCurrentPrice(): number | undefined; // Gets current price
}

/**
 * Implementation of extrinsic value flow calculations
 * Manages the calculation pipeline and data transformations
 */
export class ExtrinsicValueFlowsData extends Disposable implements IExtrinsicValueFlowsData {
  private readonly config: ExtrinsicValueFlowsConfig;
  private marketCheckTimer: number | undefined;
  private readonly _computationService: IComputationService;

  // Private observable values to store results of async computations
  private readonly _marketDataWithDeltasObservableValue = observableValue<
    MarketDataWithDeltas | undefined
  >(this, undefined);
  private readonly _intermediateOptionsFlowDataObservableValue = observableValue<
    OptionsFlowAnalytics[] | undefined
  >(this, undefined);
  private readonly _groupedOptionsFlowObservableValue = observableValue<
    GroupedOptionsFlow | undefined
  >(this, undefined);
  private readonly _flowTotalsByExpObservableValue = observableValue<
    FlowTotalsByExpiration | undefined
  >(this, undefined);
  private readonly _rawHistoricalDataObservableValue = observableValue<
    HistoricalFlowTotals | undefined
  >(this, undefined);
  private readonly _movingAverageDataObservableValue = observableValue<
    HistoricalFlowTotals | undefined
  >(this, undefined);
  private readonly _historicalFlowTotalsObservableValue = observableValue<
    HistoricalFlowTotals | undefined
  >(this, undefined);
  private readonly _aggregatedFlowDataObservableValue = observableValue<
    AggregatedFlowData | undefined
  >(this, undefined);
  private readonly _cumulativeFlowsByStrikeObservableValue = observableValue<
    CumulativeFlowsByStrike | undefined
  >(this, undefined);
  private readonly _cumulativeFlowsByExpirationAndStrikeObservableValue = observableValue<
    CumulativeFlowsByExpirationAndStrike | undefined
  >(this, undefined);

  /**
   * Tracks the last traded price of the underlying
   * Updates when new quotes are received
   */
  public readonly lastTradePrice$ = derived(reader => {
    const optionsData = this.optionDataService.optionsData$.read(reader);
    return optionsData?.lastTradePrice;
  });

  /**
   * Tracks the timestamp of the last market data update
   * Used for monitoring data freshness
   */
  public readonly lastUpdateTime$ = derived(reader => {
    const data = this._marketDataWithDeltasObservableValue.read(reader);
    return data?.timestamp;
  });

  /**
   * Market data with volume change tracking.
   */
  private readonly marketDataWithDeltas$ = derived(this, reader =>
    this._marketDataWithDeltasObservableValue.read(reader),
  );

  /**
   * Current option flow analytics
   */
  public readonly intermediateOptionsFlowData$ = derived(this, reader =>
    this._intermediateOptionsFlowDataObservableValue.read(reader),
  );

  /**
   * Groups flow analytics by expiration date
   */
  private readonly groupedOptionsFlow$ = derived(this, reader =>
    this._groupedOptionsFlowObservableValue.read(reader),
  );

  /**
   * Aggregated flow totals by expiration
   */
  private readonly flowTotalsByExp$ = derived(this, reader =>
    this._flowTotalsByExpObservableValue.read(reader),
  );

  /**
   * Raw historical data before smoothing
   */
  private readonly rawHistoricalData$ = derived(this, reader =>
    this._rawHistoricalDataObservableValue.read(reader),
  );

  /**
   * Moving average calculations of historical data
   */
  public readonly movingAverageData$ = derived(this, reader =>
    this._movingAverageDataObservableValue.read(reader),
  );

  /**
   * Fixed-size historical totals
   */
  public readonly historicalFlowTotals$ = derived(this, reader =>
    this._historicalFlowTotalsObservableValue.read(reader),
  );

  /**
   * Emits a FIFO array of last trade prices.
   * This observable's computation is synchronous and manages its own cache.
   */
  public readonly tradePrice$: IObservable<number[] | undefined> = derivedObservableWithCache<
    number[] | undefined
  >(this, (reader, lastPrices?: number[]) => {
    const currentPrice = this.optionDataService.optionsData$.read(reader)?.lastTradePrice;
    if (currentPrice === undefined) {
      return lastPrices; // Return previous array if no new price
    }
    const maxSize = this.config.tradePriceSize;
    // Initialize with an empty array if lastPrices is undefined
    const currentPrices = lastPrices ? [...lastPrices] : [];
    currentPrices.push(currentPrice);
    // Trim if oversized
    if (currentPrices.length > maxSize) {
      return currentPrices.slice(currentPrices.length - maxSize);
    }
    return currentPrices;
  });

  /**
   * Aggregates flow totals using the most recent historical data.
   */
  public readonly aggregatedFlowData$ = derived(this, reader =>
    this._aggregatedFlowDataObservableValue.read(reader),
  );

  public readonly cumulativeFlowsByStrike$ = derived(this, reader =>
    this._cumulativeFlowsByStrikeObservableValue.read(reader),
  );

  public readonly cumulativeFlowsByExpirationAndStrike$ = derived(this, reader =>
    this._cumulativeFlowsByExpirationAndStrikeObservableValue.read(reader),
  );

  constructor(
    public readonly optionDataService: IOptionDataService,
    computationService: IComputationService,
    config?: Partial<ExtrinsicValueFlowsConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._computationService = computationService;
    this._registerAutoruns();
  }

  private _registerAutoruns(): void {
    this._register(
      autorun(async reader => {
        const optionsData = this.optionDataService.optionsData$.read(reader) as
          | OptionsData
          | undefined;
        if (!optionsData?.lastTradePrice) {
          this._marketDataWithDeltasObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._marketDataWithDeltasObservableValue.get();
        const result = await this._computationService.computeMarketDataWithDeltas(
          optionsData,
          lastValue,
        );
        this._marketDataWithDeltasObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const data = this.marketDataWithDeltas$.read(reader); // Reads from the derived observable linked to the observableValue
        const result = await this._computationService.computeIntermediateOptionsFlowData(data);
        this._intermediateOptionsFlowDataObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const flows = this.intermediateOptionsFlowData$.read(reader);
        const optionsData = this.optionDataService.optionsData$.read(reader); // Read directly for instruments
        if (!flows) {
          // flows can be undefined if intermediateOptionsFlowDataObservableValue is not set yet
          this._groupedOptionsFlowObservableValue.set(undefined, undefined);
          return;
        }
        const result = await this._computationService.computeGroupedOptionsFlow(
          flows,
          optionsData?.instruments,
        );
        this._groupedOptionsFlowObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const groupedData = this.groupedOptionsFlow$.read(reader);
        if (!groupedData) {
          this._flowTotalsByExpObservableValue.set(undefined, undefined);
          return;
        }
        const result = await this._computationService.computeFlowTotalsByExpiration(groupedData);
        this._flowTotalsByExpObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const totals = this.flowTotalsByExp$.read(reader);
        if (!totals) {
          this._rawHistoricalDataObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._rawHistoricalDataObservableValue.get();
        const result = await this._computationService.computeRawHistoricalData(
          totals,
          lastValue,
          this.config.maxHistorySize,
        );
        this._rawHistoricalDataObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const rawData = this.rawHistoricalData$.read(reader);
        if (!rawData) {
          this._movingAverageDataObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._movingAverageDataObservableValue.get();
        const result = await this._computationService.computeMovingAverageData(
          rawData,
          lastValue,
          this.config.movingAveragePeriod,
        );
        this._movingAverageDataObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const maData = this.movingAverageData$.read(reader);
        if (!maData) {
          this._historicalFlowTotalsObservableValue.set(undefined, undefined);
          return;
        }
        const result = await this._computationService.computeHistoricalFlowTotals(
          maData,
          this.config.historicalTotalsSize,
        );
        this._historicalFlowTotalsObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const historical = this.historicalFlowTotals$.read(reader);
        if (!historical) {
          this._aggregatedFlowDataObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._aggregatedFlowDataObservableValue.get();
        const result = await this._computationService.computeAggregatedFlowData(
          historical,
          lastValue,
          this.config.historicalTotalsSize,
        );
        this._aggregatedFlowDataObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const intermediateFlows = this.intermediateOptionsFlowData$.read(reader);
        if (!intermediateFlows) {
          this._cumulativeFlowsByStrikeObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._cumulativeFlowsByStrikeObservableValue.get();
        const result = await this._computationService.computeCumulativeFlowsByStrike(
          intermediateFlows,
          lastValue,
          this.config.maxHistorySize,
        );
        this._cumulativeFlowsByStrikeObservableValue.set(result, undefined);
      }),
    );

    this._register(
      autorun(async reader => {
        const intermediateFlows = this.intermediateOptionsFlowData$.read(reader);
        const instruments = this.optionDataService.optionsData$.read(reader)?.instruments; // Read directly for instruments
        if (!intermediateFlows) {
          this._cumulativeFlowsByExpirationAndStrikeObservableValue.set(undefined, undefined);
          return;
        }
        const lastValue = this._cumulativeFlowsByExpirationAndStrikeObservableValue.get();
        const result = await this._computationService.computeCumulativeFlowsByExpirationAndStrike(
          intermediateFlows,
          instruments,
          lastValue,
          this.config.maxHistorySize,
        );
        this._cumulativeFlowsByExpirationAndStrikeObservableValue.set(result, undefined);
      }),
    );
  }

  private scheduleNextMarketOpen(): void {
    const nextOpen = MarketHours.getNextMarketOpen();
    if (!nextOpen) return; // Handle case where market open time might not be available
    const delay = nextOpen.getTime() - Date.now();

    if (this.marketCheckTimer !== undefined) {
      window.clearTimeout(this.marketCheckTimer);
    }
    this.marketCheckTimer = window.setTimeout(() => {
      this.start();
    }, delay);
  }

  /**
   * Initializes the service and starts data flow
   */
  public async start(): Promise<void> {
    if (!MarketHours.isMarketOpen()) {
      this.stop(); // Stop any existing data flow
      this.scheduleNextMarketOpen();
      return;
    }

    // Ensure optionDataService is started, which should trigger the autoruns
    // if it emits new data.
    await this.optionDataService.start();
  }

  public stop(): void {
    if (this.marketCheckTimer !== undefined) {
      window.clearTimeout(this.marketCheckTimer);
      this.marketCheckTimer = undefined;
    }
    this.optionDataService.stop(); // This should stop new data from optionDataService
    // Consider if observableValues should be reset here, e.g., to undefined
    // For now, they will hold their last computed value.
  }

  override dispose(): void {
    this.stop();
    super.dispose();
  }

  /**
   * Gets the current price of the underlying
   * Returns undefined if no data available
   */
  public getCurrentPrice(): number | undefined {
    // .get() is fine here for a direct, non-reactive query
    return this.optionDataService.optionsData$.get()?.lastTradePrice;
  }
}
