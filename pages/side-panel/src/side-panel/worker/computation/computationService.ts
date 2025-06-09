import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOptionsInstrument, IOptionsMarketData } from '@shared/services/request.types';
import { DataPoint } from '@src/side-panel/hooks/useHistoricals';

import {
  MarketDataWithDeltas as ExtrinsicMarketDataWithDeltas,
  OptionsFlowAnalytics as ExtrinsicOptionsFlowAnalytics,
  GroupedOptionsFlow as ExtrinsicGroupedOptionsFlow,
  FlowTotalsByExpiration as ExtrinsicFlowTotalsByExpiration,
  HistoricalFlowTotals as ExtrinsicHistoricalFlowTotals,
  AggregatedFlowData as ExtrinsicAggregatedFlowData,
  CumulativeFlowsByStrike as ExtrinsicCumulativeFlowsByStrike,
  CumulativeFlowsByExpirationAndStrike as ExtrinsicCumulativeFlowsByExpirationAndStrike,
} from '../../../services/extrinsicValue/extrinsicValueUtils';

import * as extrinsicValueUtils from '../../../services/extrinsicValue/extrinsicValueUtils';
import * as historicalsUtils from '../../../services/hostoricals/utils';
import * as sentimentUtils from '../../../services/sentiment2/sentimentUtils';

import {
  IMarketDataItem as SentimentIMarketDataItem,
  IPairedOptionData as SentimentIPairedOptionData,
  IVolatilitySkewPoint as SentimentIVolatilitySkewPoint,
  ISmaState as SentimentISmaState,
  OptionType as SentimentOptionType,
  StrikeSelectionMode as SentimentStrikeSelectionMode,
  SentimentDataPoint as SentimentSentimentDataPoint,
  SMADataPoint as SentimentSMADataPoint,
  SentimentDataConfig as SentimentSentimentDataConfig,
} from '../../../services/sentiment2/sentimentUtils';

// Interface for the optionsData parameter in computeMarketDataWithDeltas
export interface IComputeMarketDataOptions {
  marketData: Map<string, IOptionsMarketData>;
  lastTradePrice: number;
  instruments: Record<string, IOptionsInstrument>;
  timestamp?: string;
}

export const IComputationService = createDecorator<IComputationService>('computationService');

export interface IComputationService {
  readonly _serviceBrand: undefined;

  // Extrinsic Value Utils
  computeMarketDataWithDeltas(
    optionsData: IComputeMarketDataOptions,
    lastValue?: ExtrinsicMarketDataWithDeltas,
  ): Promise<ExtrinsicMarketDataWithDeltas>;
  computeIntermediateOptionsFlowData(
    data: ExtrinsicMarketDataWithDeltas | undefined,
  ): Promise<ExtrinsicOptionsFlowAnalytics[]>;
  computeGroupedOptionsFlow(
    flows: ExtrinsicOptionsFlowAnalytics[],
    instruments: Record<string, IOptionsInstrument> | undefined,
  ): Promise<ExtrinsicGroupedOptionsFlow>;
  computeFlowTotalsByExpiration(
    grouped: ExtrinsicGroupedOptionsFlow,
  ): Promise<ExtrinsicFlowTotalsByExpiration>;
  appendValueAndTruncate(arr: number[], value: number, maxSize: number): Promise<number[]>;
  computeRawHistoricalData(
    flowTotals: ExtrinsicFlowTotalsByExpiration,
    lastValue: ExtrinsicHistoricalFlowTotals | undefined,
    maxSize: number,
  ): Promise<ExtrinsicHistoricalFlowTotals>;
  computeMovingAverageData(
    rawHistorical: ExtrinsicHistoricalFlowTotals,
    lastEmaValue: ExtrinsicHistoricalFlowTotals | undefined,
    period: number,
  ): Promise<ExtrinsicHistoricalFlowTotals>;
  computeHistoricalFlowTotals(
    movingAverageData: ExtrinsicHistoricalFlowTotals,
    size?: number,
  ): Promise<ExtrinsicHistoricalFlowTotals>;
  computeAggregatedFlowData(
    historical: ExtrinsicHistoricalFlowTotals,
    lastValue: ExtrinsicAggregatedFlowData | undefined,
    limit: number,
  ): Promise<ExtrinsicAggregatedFlowData>;
  computeCumulativeFlowsByStrike(
    flows: ExtrinsicOptionsFlowAnalytics[],
    lastValue: ExtrinsicCumulativeFlowsByStrike | undefined,
    maxHistorySize: number,
  ): Promise<ExtrinsicCumulativeFlowsByStrike | undefined>;
  computeCumulativeFlowsByExpirationAndStrike(
    allFlows: ExtrinsicOptionsFlowAnalytics[],
    instruments: Record<string, IOptionsInstrument> | undefined,
    lastValue: ExtrinsicCumulativeFlowsByExpirationAndStrike | undefined,
    maxHistorySize: number,
  ): Promise<ExtrinsicCumulativeFlowsByExpirationAndStrike | undefined>;
  calculateIntrinsicValue(instrument: IOptionsInstrument, lastTradePrice: number): Promise<number>;
  calculateExtrinsicValue(marketData: IOptionsMarketData, intrinsicValue: number): Promise<number>;
  calculateMoneyFlow(extrinsicValue: number, volume: number): Promise<number>;

  // Historicals Utils
  calculateHistoricalsSMA(data: DataPoint[], window: number): Promise<DataPoint[]>;
  calculateMovingAverage(data: number[], periods: number): Promise<number[]>;
  calculateSMAForSymbol(prices: number[], period: number, maxSize: number): Promise<number[]>;
  calculatePercentChangesForSymbol(averages: number[], maxSize: number): Promise<number[]>;
  calculateDerivative(data: DataPoint[]): Promise<DataPoint[]>;

  // Sentiment Utils
  processMarketData(
    instruments: Record<string, IOptionsInstrument> | undefined,
    marketData: Map<string, IOptionsMarketData> | undefined,
    optionType: SentimentOptionType,
    currentPrice?: number,
    numStrikes?: number,
    strikeSelectionMode?: SentimentStrikeSelectionMode,
  ): Promise<SentimentIMarketDataItem[]>;
  filterInstrumentsAroundPrice(
    instruments: IOptionsInstrument[],
    currentPrice: number,
    numStrikesOneDirection: number,
    optionType: SentimentOptionType,
    strikeMode?: SentimentStrikeSelectionMode,
  ): Promise<IOptionsInstrument[]>;
  groupMarketDataByExpiration(
    items: SentimentIMarketDataItem[],
  ): Promise<Map<string, SentimentIMarketDataItem[]>>;
  pairOptions(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<SentimentIPairedOptionData[]>;
  pairOptionsByDelta(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<SentimentIPairedOptionData[]>;
  calculateSentiment(
    pairs: SentimentIPairedOptionData[],
    config?: Partial<SentimentSentimentDataConfig>,
  ): Promise<number>;
  calculateSentimentSMA(history: number[], period: number): Promise<number>;
  calculateCurrentSMA(history: SentimentSentimentDataPoint[], period: number): Promise<number>;
  calculateSMAHistory(
    history: SentimentSentimentDataPoint[],
    period: number,
  ): Promise<SentimentSMADataPoint[]>;
  calculateEMAHistory(
    history: SentimentSentimentDataPoint[],
    period: number,
  ): Promise<SentimentSMADataPoint[]>;
  didSmaStateMapChange(
    map1: Map<string, Map<number, SentimentISmaState>>,
    map2: Map<string, Map<number, SentimentISmaState>>,
  ): Promise<boolean>;
  createVolatilitySkewPoints(
    pairs: SentimentIPairedOptionData[],
    smaState?: Map<number, SentimentISmaState>,
    period?: number,
  ): Promise<{
    skewPoints: SentimentIVolatilitySkewPoint[];
    updatedSmaState: Map<number, SentimentISmaState>;
  }>;
  calculatePairedOptionsByExpiration(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<Map<string, SentimentIPairedOptionData[]>>;
  calculateSentimentForEachExpiration(
    pairedOptionsByExpiration: Map<string, SentimentIPairedOptionData[]>,
    config: Partial<SentimentSentimentDataConfig>,
  ): Promise<Map<string, number>>;
  generateVolatilitySkewsAndNextSmaState(
    pairedOptionsByExpiration: Map<string, SentimentIPairedOptionData[]>,
    currentSmaStateByExpiration: Map<string, Map<number, SentimentISmaState>>,
    period: number,
  ): Promise<{
    volatilitySkews: Map<string, SentimentIVolatilitySkewPoint[]>;
    nextSmaStateByExpiration: Map<string, Map<number, SentimentISmaState>>;
  }>;
}

export class ComputationService implements IComputationService {
  readonly _serviceBrand: undefined;

  // Extrinsic Value Utils
  public async computeMarketDataWithDeltas(
    optionsData: IComputeMarketDataOptions,
    lastValue?: ExtrinsicMarketDataWithDeltas,
  ): Promise<ExtrinsicMarketDataWithDeltas> {
    return Promise.resolve(extrinsicValueUtils.computeMarketDataWithDeltas(optionsData, lastValue));
  }
  public async computeIntermediateOptionsFlowData(
    data: ExtrinsicMarketDataWithDeltas | undefined,
  ): Promise<ExtrinsicOptionsFlowAnalytics[]> {
    return Promise.resolve(extrinsicValueUtils.computeIntermediateOptionsFlowData(data));
  }
  public async computeGroupedOptionsFlow(
    flows: ExtrinsicOptionsFlowAnalytics[],
    instruments: Record<string, IOptionsInstrument> | undefined,
  ): Promise<ExtrinsicGroupedOptionsFlow> {
    return Promise.resolve(extrinsicValueUtils.computeGroupedOptionsFlow(flows, instruments));
  }
  public async computeFlowTotalsByExpiration(
    grouped: ExtrinsicGroupedOptionsFlow,
  ): Promise<ExtrinsicFlowTotalsByExpiration> {
    return Promise.resolve(extrinsicValueUtils.computeFlowTotalsByExpiration(grouped));
  }
  public async appendValueAndTruncate(
    arr: number[],
    value: number,
    maxSize: number,
  ): Promise<number[]> {
    return Promise.resolve(extrinsicValueUtils.appendValueAndTruncate(arr, value, maxSize));
  }
  public async computeRawHistoricalData(
    flowTotals: ExtrinsicFlowTotalsByExpiration,
    lastValue: ExtrinsicHistoricalFlowTotals | undefined,
    maxSize: number,
  ): Promise<ExtrinsicHistoricalFlowTotals> {
    return Promise.resolve(
      extrinsicValueUtils.computeRawHistoricalData(flowTotals, lastValue, maxSize),
    );
  }
  public async computeMovingAverageData(
    rawHistorical: ExtrinsicHistoricalFlowTotals,
    lastEmaValue: ExtrinsicHistoricalFlowTotals | undefined,
    period: number,
  ): Promise<ExtrinsicHistoricalFlowTotals> {
    return Promise.resolve(
      extrinsicValueUtils.computeMovingAverageData(rawHistorical, lastEmaValue, period),
    );
  }
  public async computeHistoricalFlowTotals(
    movingAverageData: ExtrinsicHistoricalFlowTotals,
    size?: number,
  ): Promise<ExtrinsicHistoricalFlowTotals> {
    return Promise.resolve(
      extrinsicValueUtils.computeHistoricalFlowTotals(movingAverageData, size),
    );
  }
  public async computeAggregatedFlowData(
    historical: ExtrinsicHistoricalFlowTotals,
    lastValue: ExtrinsicAggregatedFlowData | undefined,
    limit: number,
  ): Promise<ExtrinsicAggregatedFlowData> {
    return Promise.resolve(
      extrinsicValueUtils.computeAggregatedFlowData(historical, lastValue, limit),
    );
  }
  public async computeCumulativeFlowsByStrike(
    flows: ExtrinsicOptionsFlowAnalytics[],
    lastValue: ExtrinsicCumulativeFlowsByStrike | undefined,
    maxHistorySize: number,
  ): Promise<ExtrinsicCumulativeFlowsByStrike | undefined> {
    return Promise.resolve(
      extrinsicValueUtils.computeCumulativeFlowsByStrike(flows, lastValue, maxHistorySize),
    );
  }
  public async computeCumulativeFlowsByExpirationAndStrike(
    allFlows: ExtrinsicOptionsFlowAnalytics[],
    instruments: Record<string, IOptionsInstrument> | undefined,
    lastValue: ExtrinsicCumulativeFlowsByExpirationAndStrike | undefined,
    maxHistorySize: number,
  ): Promise<ExtrinsicCumulativeFlowsByExpirationAndStrike | undefined> {
    return Promise.resolve(
      extrinsicValueUtils.computeCumulativeFlowsByExpirationAndStrike(
        allFlows,
        instruments,
        lastValue,
        maxHistorySize,
      ),
    );
  }
  public async calculateIntrinsicValue(
    instrument: IOptionsInstrument,
    lastTradePrice: number,
  ): Promise<number> {
    return Promise.resolve(extrinsicValueUtils.calculateIntrinsicValue(instrument, lastTradePrice));
  }
  public async calculateExtrinsicValue(
    marketData: IOptionsMarketData,
    intrinsicValue: number,
  ): Promise<number> {
    return Promise.resolve(extrinsicValueUtils.calculateExtrinsicValue(marketData, intrinsicValue));
  }
  public async calculateMoneyFlow(extrinsicValue: number, volume: number): Promise<number> {
    return Promise.resolve(extrinsicValueUtils.calculateMoneyFlow(extrinsicValue, volume));
  }

  // Historicals Utils
  public async calculateHistoricalsSMA(data: DataPoint[], window: number): Promise<DataPoint[]> {
    return Promise.resolve(historicalsUtils.calculateSMA(data, window));
  }
  public async calculateMovingAverage(data: number[], periods: number): Promise<number[]> {
    return Promise.resolve(historicalsUtils.calculateMovingAverage(data, periods));
  }
  public async calculateSMAForSymbol(
    prices: number[],
    period: number,
    maxSize: number,
  ): Promise<number[]> {
    return Promise.resolve(historicalsUtils.calculateSMAForSymbol(prices, period, maxSize));
  }
  public async calculatePercentChangesForSymbol(
    averages: number[],
    maxSize: number,
  ): Promise<number[]> {
    return Promise.resolve(historicalsUtils.calculatePercentChangesForSymbol(averages, maxSize));
  }
  public async calculateDerivative(data: DataPoint[]): Promise<DataPoint[]> {
    return Promise.resolve(historicalsUtils.calculateDerivative(data));
  }

  // Sentiment Utils
  public async processMarketData(
    instruments: Record<string, IOptionsInstrument> | undefined,
    marketData: Map<string, IOptionsMarketData> | undefined,
    optionType: SentimentOptionType,
    currentPrice?: number,
    numStrikes?: number,
    strikeSelectionMode?: SentimentStrikeSelectionMode,
  ): Promise<SentimentIMarketDataItem[]> {
    return Promise.resolve(
      sentimentUtils.processMarketData(
        instruments,
        marketData,
        optionType,
        currentPrice,
        numStrikes,
        strikeSelectionMode,
      ),
    );
  }
  public async filterInstrumentsAroundPrice(
    instruments: IOptionsInstrument[],
    currentPrice: number,
    numStrikesOneDirection: number,
    optionType: SentimentOptionType,
    strikeMode?: SentimentStrikeSelectionMode,
  ): Promise<IOptionsInstrument[]> {
    return Promise.resolve(
      sentimentUtils.filterInstrumentsAroundPrice(
        instruments,
        currentPrice,
        numStrikesOneDirection,
        optionType,
        strikeMode,
      ),
    );
  }
  public async groupMarketDataByExpiration(
    items: SentimentIMarketDataItem[],
  ): Promise<Map<string, SentimentIMarketDataItem[]>> {
    return Promise.resolve(sentimentUtils.groupMarketDataByExpiration(items));
  }
  public async pairOptions(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<SentimentIPairedOptionData[]> {
    return Promise.resolve(sentimentUtils.pairOptions(calls, puts));
  }
  public async pairOptionsByDelta(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<SentimentIPairedOptionData[]> {
    return Promise.resolve(sentimentUtils.pairOptionsByDelta(calls, puts));
  }
  public async calculateSentiment(
    pairs: SentimentIPairedOptionData[],
    config?: Partial<SentimentSentimentDataConfig>,
  ): Promise<number> {
    return Promise.resolve(sentimentUtils.calculateSentiment(pairs, config));
  }
  public async calculateSentimentSMA(history: number[], period: number): Promise<number> {
    return Promise.resolve(sentimentUtils.calculateSMA(history, period));
  }
  public async calculateCurrentSMA(
    history: SentimentSentimentDataPoint[],
    period: number,
  ): Promise<number> {
    return Promise.resolve(sentimentUtils.calculateCurrentSMA(history, period));
  }
  public async calculateSMAHistory(
    history: SentimentSentimentDataPoint[],
    period: number,
  ): Promise<SentimentSMADataPoint[]> {
    return Promise.resolve(sentimentUtils.calculateSMAHistory(history, period));
  }
  public async calculateEMAHistory(
    history: SentimentSentimentDataPoint[],
    period: number,
  ): Promise<SentimentSMADataPoint[]> {
    return Promise.resolve(sentimentUtils.calculateEMAHistory(history, period));
  }
  public async didSmaStateMapChange(
    map1: Map<string, Map<number, SentimentISmaState>>,
    map2: Map<string, Map<number, SentimentISmaState>>,
  ): Promise<boolean> {
    return Promise.resolve(sentimentUtils.didSmaStateMapChange(map1, map2));
  }
  public async createVolatilitySkewPoints(
    pairs: SentimentIPairedOptionData[],
    smaState?: Map<number, SentimentISmaState>,
    period?: number,
  ): Promise<{
    skewPoints: SentimentIVolatilitySkewPoint[];
    updatedSmaState: Map<number, SentimentISmaState>;
  }> {
    return Promise.resolve(sentimentUtils.createVolatilitySkewPoints(pairs, smaState, period));
  }
  public async calculatePairedOptionsByExpiration(
    calls: SentimentIMarketDataItem[],
    puts: SentimentIMarketDataItem[],
  ): Promise<Map<string, SentimentIPairedOptionData[]>> {
    return Promise.resolve(sentimentUtils.calculatePairedOptionsByExpiration(calls, puts));
  }
  public async calculateSentimentForEachExpiration(
    pairedOptionsByExpiration: Map<string, SentimentIPairedOptionData[]>,
    config: Partial<SentimentSentimentDataConfig>,
  ): Promise<Map<string, number>> {
    return Promise.resolve(
      sentimentUtils.calculateSentimentForEachExpiration(pairedOptionsByExpiration, config),
    );
  }
  public async generateVolatilitySkewsAndNextSmaState(
    pairedOptionsByExpiration: Map<string, SentimentIPairedOptionData[]>,
    currentSmaStateByExpiration: Map<string, Map<number, SentimentISmaState>>,
    period: number,
  ): Promise<{
    volatilitySkews: Map<string, SentimentIVolatilitySkewPoint[]>;
    nextSmaStateByExpiration: Map<string, Map<number, SentimentISmaState>>;
  }> {
    return Promise.resolve(
      sentimentUtils.generateVolatilitySkewsAndNextSmaState(
        pairedOptionsByExpiration,
        currentSmaStateByExpiration,
        period,
      ),
    );
  }
}

registerSingleton(IComputationService, ComputationService, InstantiationType.Delayed);
