import { IExtrinsicDataService } from '../../data/extrinsicData.service';
import type {
  BaseExtrinsicValueFlowsConfig,
  IExtrinsicValueFlowsData,
} from '@src/services/extrinsicValue/extrinsicValueFlowsData.service';
import { derived, IObservable, observableValue } from 'vs/base/common/observable';
import { Disposable } from 'vs/base/common/lifecycle';

/**
 * Represents the processed extrinsic value indicator data for a specific symbol
 * @interface ExtrinsicIndicatorData
 * @property {string} symbol - The trading symbol (e.g., "QQQ", "SPY")
 * @property {number} putFlow - Aggregated put options flow (extrinsicValue * volume)
 * @property {number} callFlow - Aggregated call options flow (extrinsicValue * volume)
 * @property {string | undefined} timestamp - Last market data update timestamp
 * @property {number | undefined} price - Current underlying asset price
 * @property {number} callVolume - Aggregated call options volume
 * @property {number} putVolume - Aggregated put options volume
 * @property {number} callExtrinsicValue - Aggregated call options extrinsic value
 * @property {number} putExtrinsicValue - Aggregated put options extrinsic value
 * @property {number} cumulativeFlow - Cumulative flow value
 * @property {number | undefined} cumulativeFlow10 - Cumulative flow value for 10 periods
 * @property {number | undefined} cumulativeFlow50 - Cumulative flow value for 50 periods
 */
export interface ExtrinsicIndicatorData {
  symbol: string;
  putFlow: number;
  callFlow: number;
  timestamp: string | undefined;
  price: number | undefined;
  cumulativeFlow: number;
  cumulativeFlow5?: number;
  cumulativeFlow8?: number;
  cumulativeFlow10?: number;
  cumulativeFlow20?: number;
  cumulativeFlow30?: number;
  cumulativeFlow40?: number;
  cumulativeFlow50?: number;
}

export interface ExtrinsicIndicatorConfig extends BaseExtrinsicValueFlowsConfig {
  expirationIndex: number;
}

/**
 * Observes and processes options flow data to generate extrinsic value indicators
 * Uses a chain of computations:
 * 1. Fetches raw options data via ExtrinsicDataService
 * 2. Processes historical flow totals through moving averages
 * 3. Aggregates put/call flow data by expiration date
 * 4. Generates real-time indicator updates
 */
export class ExtrinsicIndicatorObs extends Disposable {
  /**
   * Observable containing processed options flow data with moving averages
   * Updates when new market data is received
   * @private
   */
  private readonly _flows = observableValue<IExtrinsicValueFlowsData | undefined>(
    'flows',
    undefined,
  );

  /**
   * Public observable that emits the latest indicator data
   * Computed from:
   * - Historical flow totals (moving average of extrinsic value * volume)
   * - Latest market prices
   * - Market data timestamps
   * Focus on the nearest expiration date after current
   */
  public readonly indicatorData$: IObservable<ExtrinsicIndicatorData | undefined>;

  private readonly config: ExtrinsicIndicatorConfig;

  constructor(
    private readonly symbol: string,
    config: ExtrinsicIndicatorConfig,
    @IExtrinsicDataService private readonly extrinsicDataService: IExtrinsicDataService,
  ) {
    super();
    this.config = config;
    void this.initializeFlows();

    this.indicatorData$ = derived(reader => {
      const flows = this._flows.read(reader);
      if (!flows) return undefined;
      const lastUpdateTime = flows.lastUpdateTime$.read(reader);
      const currentPrice = flows.getCurrentPrice();
      const historicalFlowTotals = flows.historicalFlowTotals$.read(reader);
      const intermediateData = flows.intermediateOptionsFlowData$.read(reader);

      if (!historicalFlowTotals || !intermediateData) return undefined;

      const expirationDates = Object.keys(historicalFlowTotals).sort();
      if (expirationDates.length <= this.config.expirationIndex) return undefined;

      const targetExpiration = expirationDates[this.config.expirationIndex];
      const flowData = historicalFlowTotals[targetExpiration];

      // Calculate latest flow values
      const lastCallFlow = flowData.call[flowData.call.length - 1] || 0;
      const lastPutFlow = flowData.put[flowData.put.length - 1] || 0;
      const lastCumulative = flowData.cumulative[flowData.cumulative.length - 1] || 0;
      const lastCumulative5 = flowData.cumulative5
        ? flowData.cumulative5[flowData.cumulative5.length - 1]
        : undefined;
      const lastCumulative8 = flowData.cumulative8
        ? flowData.cumulative8[flowData.cumulative8.length - 1]
        : undefined;
      const lastCumulative10 = flowData.cumulative10
        ? flowData.cumulative10[flowData.cumulative10.length - 1]
        : undefined;
      const lastCumulative20 = flowData.cumulative20
        ? flowData.cumulative20[flowData.cumulative20.length - 1]
        : undefined;
      const lastCumulative30 = flowData.cumulative30
        ? flowData.cumulative30[flowData.cumulative30.length - 1]
        : undefined;
      const lastCumulative40 = flowData.cumulative40
        ? flowData.cumulative40[flowData.cumulative40.length - 1]
        : undefined;
      const lastCumulative50 = flowData.cumulative50
        ? flowData.cumulative50[flowData.cumulative50.length - 1]
        : undefined;

      return {
        symbol: this.symbol,
        callFlow: lastCallFlow,
        putFlow: lastPutFlow,
        timestamp: lastUpdateTime,
        price: currentPrice,
        cumulativeFlow: lastCumulative,
        cumulativeFlow5: lastCumulative5,
        cumulativeFlow8: lastCumulative8,
        cumulativeFlow10: lastCumulative10,
        cumulativeFlow20: lastCumulative20,
        cumulativeFlow30: lastCumulative30,
        cumulativeFlow40: lastCumulative40,
        cumulativeFlow50: lastCumulative50,
      };
    });
  }

  /**
   * Initializes the options flow data processing pipeline
   * Configuration:
   * - maxHistorySize: 1000 data points
   * - movingAveragePeriod: 6 periods for smoothing
   * - historicalTotalsSize: 40 data points retained
   * @private
   */
  private async initializeFlows(): Promise<void> {
    const flows = await this.extrinsicDataService.get(this.symbol, this.config);
    this._flows.set(flows, undefined);
  }
}
