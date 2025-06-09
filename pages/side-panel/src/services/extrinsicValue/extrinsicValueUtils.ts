import { IOptionsMarketData, IOptionsInstrument } from '@shared/services/request.types';

/**
 * Functions from this module called by other files:
 * - computeMarketDataWithDeltas
 * - computeIntermediateOptionsFlowData
 * - computeGroupedOptionsFlow
 * - computeFlowTotalsByExpiration
 * - computeRawHistoricalData
 * - computeMovingAverageData
 * - computeHistoricalFlowTotals
 * - computeAggregatedFlowData
 * - computeCumulativeFlowsByStrike
 * - computeCumulativeFlowsByExpirationAndStrike
 */

/**
 * Market data snapshot with volume change tracking
 * Combines current market state with volume delta calculations
 */
export interface MarketDataWithDeltas {
  marketData: Map<string, IOptionsMarketData>; // Current market data by instrument
  lastTradePrice: number; // Latest underlying price
  instruments: Record<string, IOptionsInstrument>; // Available instruments
  volumeDeltas: Map<string, number>; // Volume changes since last update
  timestamp: string; // Snapshot timestamp
  highestVolumeMap: Map<string, number>; // Tracks the highest volume observed for each instrument
  isFirstSnapshot: boolean; // Flag to indicate if this is the first snapshot (to ignore initial volumes)
}

/**
 * Analytics data for individual option flow analysis
 * Contains calculated values and metadata for each option
 */
export interface OptionsFlowAnalytics {
  instrumentId: string; // Unique identifier
  symbol: string; // Underlying symbol
  type: string; // Option type (call/put)
  strike: number; // Strike price
  moneyFlow: number; // Calculated money flow value
  intrinsicValue: number; // Option's intrinsic value
  extrinsicValue: number; // Option's extrinsic value
  volume: number; // Trading volume
  volumeDelta: number; // Volume change
}

/**
 * Groups option flow analytics by expiration date and type
 * Shape: {
 *   "2024-01-19": {
 *     call: OptionsFlowAnalytics[],
 *     put: OptionsFlowAnalytics[]
 *   }
 * }
 */
export interface GroupedOptionsFlow {
  [expirationDate: string]: {
    call: OptionsFlowAnalytics[];
    put: OptionsFlowAnalytics[];
  };
}

/**
 * Aggregated flow totals by expiration date
 * Tracks call and put total values separately
 */
export interface FlowTotalsByExpiration {
  [expirationDate: string]: {
    call: number;
    put: number;
  };
}

/**
 * Historical flow data with arrays of values
 * Maintains separate histories for calls and puts
 */
export interface HistoricalFlowTotals {
  [expirationDate: string]: {
    call: number[];
    put: number[];
    cumulative: number[];
    cumulative5?: number[];
    cumulative8?: number[];
    cumulative10?: number[];
    cumulative20?: number[];
    cumulative30?: number[];
    cumulative40?: number[];
    cumulative50?: number[];
  };
}

export interface AggregatedFlowData {
  calls: number[];
  puts: number[];
  cumulative: number[];
  cumulative5?: number[];
  cumulative8?: number[];
  cumulative10?: number[];
  cumulative20?: number[];
  cumulative30?: number[];
  cumulative40?: number[];
  cumulative50?: number[];
}

export interface CumulativeFlowsByStrike {
  [strikePrice: string]: AggregatedFlowData;
}

export interface CumulativeFlowsByExpirationAndStrike {
  [expirationDate: string]: CumulativeFlowsByStrike;
}

/**
 * Computes market data deltas between updates
 * @param optionsData Current market data snapshot
 * @param lastValue Previous market data snapshot, now including highestVolumeMap
 * @returns Combined market data with volume changes and updated highestVolumeMap
 */
export function computeMarketDataWithDeltas(
  optionsData: {
    marketData: Map<string, IOptionsMarketData>;
    lastTradePrice: number;
    instruments: Record<string, IOptionsInstrument>;
    timestamp?: string;
  },
  lastValue?: MarketDataWithDeltas,
): MarketDataWithDeltas {
  const volumeDeltas = new Map<string, number>();
  const newHighestVolumeMap = new Map<string, number>(lastValue?.highestVolumeMap ?? []);
  const isFirstSnapshot = !lastValue;

  if (!optionsData.marketData || !optionsData.instruments) {
    return {
      marketData: optionsData.marketData ?? new Map(),
      lastTradePrice: optionsData.lastTradePrice,
      instruments: optionsData.instruments ?? {},
      volumeDeltas,
      timestamp: optionsData.timestamp ?? new Date().toISOString(),
      highestVolumeMap: newHighestVolumeMap,
      isFirstSnapshot,
    };
  }

  if (isFirstSnapshot) {
    // On the first snapshot, record the base volumes and set all deltas to 0
    for (const [instrumentId, currentMarketDataItem] of optionsData.marketData.entries()) {
      const currentVolume = currentMarketDataItem.volume;
      if (typeof currentVolume === 'number' && !isNaN(currentVolume)) {
        newHighestVolumeMap.set(instrumentId, currentVolume);
      }
      volumeDeltas.set(instrumentId, 0);
    }
  } else {
    // On the second and subsequent snapshots, compute deltas
    for (const [instrumentId, currentMarketDataItem] of optionsData.marketData.entries()) {
      const instrument = optionsData.instruments[instrumentId];
      if (!instrument) {
        continue;
      }
      const currentVolume = currentMarketDataItem.volume;
      if (typeof currentVolume !== 'number' || isNaN(currentVolume)) {
        volumeDeltas.set(instrumentId, 0);
        if (lastValue?.highestVolumeMap?.has(instrumentId)) {
          newHighestVolumeMap.set(instrumentId, lastValue.highestVolumeMap.get(instrumentId)!);
        }
        continue;
      }
      const lastRecordedHighestVolume = lastValue?.highestVolumeMap?.get(instrumentId) ?? 0;
      const previousMarketDataItem = lastValue?.marketData?.get(instrumentId);
      if (currentVolume >= lastRecordedHighestVolume) {
        newHighestVolumeMap.set(instrumentId, currentVolume);
        const previousActualVolume = previousMarketDataItem?.volume ?? 0;
        const delta = currentVolume - previousActualVolume;
        volumeDeltas.set(instrumentId, Math.max(0, delta));
      } else {
        volumeDeltas.set(instrumentId, 0);
        if (lastValue?.highestVolumeMap?.has(instrumentId)) {
          newHighestVolumeMap.set(instrumentId, lastRecordedHighestVolume);
        }
      }
    }
  }

  return {
    marketData: optionsData.marketData,
    lastTradePrice: optionsData.lastTradePrice,
    instruments: optionsData.instruments,
    volumeDeltas,
    timestamp: optionsData.timestamp ?? new Date().toISOString(),
    highestVolumeMap: newHighestVolumeMap,
    isFirstSnapshot,
  };
}

/**
 * Calculates intermediate analytics for option flows
 * Processes raw market data into analyzable metrics
 */
export function computeIntermediateOptionsFlowData(
  data: MarketDataWithDeltas | undefined,
): OptionsFlowAnalytics[] {
  // Skip processing on the first snapshot to ignore initial large volumes
  if (data?.isFirstSnapshot) {
    return [];
  }
  if (!data) return [];
  const { marketData, lastTradePrice, instruments, volumeDeltas } = data;
  const analytics: OptionsFlowAnalytics[] = [];
  for (const [instrumentId, marketDataItem] of marketData.entries()) {
    const instrument = instruments[instrumentId];
    if (!instrument) continue;
    const intrinsicValue = calculateIntrinsicValue(instrument, lastTradePrice);
    const extrinsicValue = calculateExtrinsicValue(marketDataItem, intrinsicValue);
    const volumeDelta = volumeDeltas.get(instrumentId) ?? 0;
    const moneyFlow = calculateMoneyFlow(extrinsicValue, volumeDelta);
    analytics.push({
      instrumentId,
      symbol: instrument.chain_symbol,
      type: instrument.type,
      strike: parseFloat(instrument.strike_price),
      moneyFlow,
      intrinsicValue,
      extrinsicValue,
      volume: marketDataItem.volume,
      volumeDelta,
    });
  }
  return analytics;
}

/**
 * Sums the moneyFlow property from an array of OptionsFlowAnalytics.
 * @param flows - An array of OptionsFlowAnalytics.
 * @returns The total money flow.
 */
function sumMoneyFlow(flows: OptionsFlowAnalytics[]): number {
  return flows.reduce((sum, f) => sum + f.moneyFlow, 0);
}

/**
 * For each window size in `periods`, compute computeMovingSum(diff, period)
 * and return an object like { cumulative5: [...], cumulative8: [...], … }.
 * @param diff - Array of differences (e.g., calls[i] - puts[i]).
 * @param periods - An array of window sizes for the moving sums.
 * @returns An object where keys are `cumulative${period}` and values are the corresponding moving sum arrays.
 */
function computeMultipleMovingSums(diff: number[], periods: number[]): Record<string, number[]> {
  return periods.reduce((accumulator: Record<string, number[]>, period: number) => {
    accumulator[`cumulative${period}`] = computeMovingSum(diff, period);
    return accumulator;
  }, {});
}

/**
 * Groups option flow analytics by expiration date
 * Separates calls and puts for each date
 */
export function computeGroupedOptionsFlow(
  flows: OptionsFlowAnalytics[],
  instruments: Record<string, IOptionsInstrument> | undefined,
): GroupedOptionsFlow {
  if (!instruments) return {};
  return flows.reduce((accumulator: GroupedOptionsFlow, flow: OptionsFlowAnalytics) => {
    const instrument = instruments[flow.instrumentId];
    if (!instrument) return accumulator;
    const expirationDate = instrument.expiration_date;
    const side = flow.type === 'call' ? 'call' : 'put';
    if (!accumulator[expirationDate]) {
      accumulator[expirationDate] = { call: [], put: [] };
    }
    accumulator[expirationDate][side].push(flow);
    return accumulator;
  }, {});
}

/**
 * Calculates total flows for each expiration date
 * Aggregates call and put values separately
 */
export function computeFlowTotalsByExpiration(grouped: GroupedOptionsFlow): FlowTotalsByExpiration {
  const result: FlowTotalsByExpiration = {};
  for (const expirationDate in grouped) {
    const group = grouped[expirationDate];
    result[expirationDate] = {
      call: sumMoneyFlow(group.call),
      put: sumMoneyFlow(group.put),
    };
  }
  return result;
}

/**
 * Adds a new value to an array and maintains maximum size
 * Used for maintaining history arrays
 */
export function appendValueAndTruncate(arr: number[], value: number, maxSize: number): number[] {
  return [...arr, value].slice(-maxSize);
}

/**
 * Processes flow totals into historical data structure
 * Maintains separate histories for calls and puts
 */
export function computeRawHistoricalData(
  flowTotals: FlowTotalsByExpiration,
  lastValue: HistoricalFlowTotals | undefined,
  maxSize: number,
): HistoricalFlowTotals {
  const result: HistoricalFlowTotals = {};
  for (const [expirationDate, { call, put }] of Object.entries(flowTotals)) {
    const prevValues = lastValue?.[expirationDate] ?? { call: [], put: [] };
    const newCalls = appendValueAndTruncate(prevValues.call, call, maxSize);
    const newPuts = appendValueAndTruncate(prevValues.put, put, maxSize);
    result[expirationDate] = { call: newCalls, put: newPuts, cumulative: [] };
  }
  return result;
}

/**
 * Calculates Exponential Moving Averages (EMA) from historical data.
 * Smooths data for trend analysis, giving more weight to recent data.
 *
 * @param rawHistorical - Object containing arrays of raw historical values for calls and puts per expiration date.
 * @param lastEmaValue - Object containing the previous EMA calculation results.
 * @param period - The period for the EMA calculation.
 * @returns HistoricalFlowTotals object containing the updated EMA values.
 */
export function computeMovingAverageData(
  rawHistorical: HistoricalFlowTotals,
  lastEmaValue: HistoricalFlowTotals | undefined,
  period: number,
): HistoricalFlowTotals {
  const result: HistoricalFlowTotals = {};
  const smoothingFactor = 2 / (period + 1);

  for (const [expirationDate, data] of Object.entries(rawHistorical)) {
    // Get the latest raw values
    const latestRawCall = data.call.length > 0 ? data.call[data.call.length - 1] : 0;
    const latestRawPut = data.put.length > 0 ? data.put[data.put.length - 1] : 0;

    // Get the previous EMA arrays and the last EMA value
    const prevCallEmaArray = lastEmaValue?.[expirationDate]?.call ?? [];
    const prevPutEmaArray = lastEmaValue?.[expirationDate]?.put ?? [];
    const lastCallEma =
      prevCallEmaArray.length > 0 ? prevCallEmaArray[prevCallEmaArray.length - 1] : undefined;
    const lastPutEma =
      prevPutEmaArray.length > 0 ? prevPutEmaArray[prevPutEmaArray.length - 1] : undefined;

    // Calculate the new EMA values
    const newCallEma =
      lastCallEma !== undefined
        ? latestRawCall * smoothingFactor + lastCallEma * (1 - smoothingFactor)
        : latestRawCall; // Use the first raw value if no previous EMA exists

    const newPutEma =
      lastPutEma !== undefined
        ? latestRawPut * smoothingFactor + lastPutEma * (1 - smoothingFactor)
        : latestRawPut; // Use the first raw value if no previous EMA exists

    // Append the new EMA value to the previous array
    result[expirationDate] = {
      call: [...prevCallEmaArray, newCallEma],
      put: [...prevPutEmaArray, newPutEma],
      // Cumulative is calculated in a later step, initialize as empty
      cumulative: [],
    };
  }
  return result;
}

/**
 * Computes the full cumulative series (running total) from the call and put arrays.
 * Each element is defined as:
 *    cumulative[i] = sum_{j=0}^{i} (calls[j] - puts[j])
 *
 * @param calls - Full array of call flow values.
 * @param puts - Full array of put flow values.
 * @returns The cumulative array.
 */
function computeCumulativeArray(calls: number[], puts: number[]): number[] {
  const cumulative: number[] = [];
  let runningTotal = 0;
  for (let i = 0; i < calls.length; i++) {
    runningTotal += calls[i] - puts[i];
    cumulative.push(runningTotal);
  }
  return cumulative;
}

/**
 * Computes a moving sum (sliding-window sum) of the difference array.
 * For each index i:
 *   - If i < window, returns the sum from index 0 to i.
 *   - Otherwise, returns the sum of the last 'window' elements:
 *         sum(diff[i-window+1] ... diff[i])
 *
 * @param diff - Array of differences (calls[i] - puts[i]).
 * @param window - The window size for the moving sum.
 * @returns A new array of the same length as `diff` with the moving sums.
 */
function computeMovingSum(diff: number[], window: number): number[] {
  const result: number[] = [];
  let currentSum = 0;
  for (let i = 0; i < diff.length; i++) {
    currentSum += diff[i];
    // When we have accumulated more than 'window' elements, remove the element that falls out.
    if (i >= window) {
      currentSum -= diff[i - window];
    }
    result.push(currentSum);
  }
  return result;
}

/**
 * Processes moving average data into historical flow totals.
 * It uses the full input arrays for accurate cumulative calculations and
 * then (optionally) slices the results to a fixed size.
 *
 * For each expiration date, the function computes:
 *   - call: the call values array
 *   - put: the put values array
 *   - cumulative: the full running total of (call - put)
 *   - cumulative5: moving sum over the last 5 differences (for each index)
 *   - cumulative10: moving sum over the last 10 differences
 *   - cumulative20: moving sum over the last 20 differences
 *   - cumulative30: moving sum over the last 30 differences
 *   - cumulative40: moving sum over the last 40 differences
 *   - cumulative50: moving sum over the last 50 differences
 *
 * If a size parameter is provided (e.g. 15), the final output arrays are sliced to keep only the last `size` items.
 *
 * @param movingAverageData - An object mapping expiration dates to HistoricalFlowTotals (each with full arrays).
 * @param size - Optional. If provided and less than the length of the arrays, output arrays are sliced to the last `size` elements.
 * @returns A new HistoricalFlowTotals object with full cumulative calculations.
 */
export function computeHistoricalFlowTotals(
  movingAverageData: HistoricalFlowTotals,
  size?: number,
): HistoricalFlowTotals {
  const result: HistoricalFlowTotals = {};
  const periods = [5, 8, 10, 20, 30, 40, 50];
  for (const [expirationDate, data] of Object.entries(movingAverageData)) {
    // Use the full arrays (do not slice them before computing totals)
    const calls = data.call;
    const puts = data.put;

    // Compute the full cumulative (running total) array.
    const cumulative = computeCumulativeArray(calls, puts);

    // Compute the difference array.
    const diff = calls.map((c, i) => c - puts[i]);

    // Compute moving sums over different window sizes.
    const movingSums = computeMultipleMovingSums(diff, periods);

    // If a slice size is provided and is smaller than the full length, slice the arrays.
    const sliceArray = <T>(array: T[]): T[] =>
      size && size < array.length ? array.slice(-size) : array;
    const resultObj: HistoricalFlowTotals[string] = {
      call: sliceArray(calls),
      put: sliceArray(puts),
      cumulative: sliceArray(cumulative),
    };
    for (const period of periods) {
      const key = `cumulative${period}` as keyof HistoricalFlowTotals[string];
      resultObj[key] = sliceArray(movingSums[key]);
    }
    result[expirationDate] = resultObj;
  }
  return result;
}

/**
 * Helper function to compute the new call and put totals
 * from the latest entries in the historical data.
 */
function getLatestTotals(historical: HistoricalFlowTotals): { call: number; put: number } {
  return Object.values(historical).reduce(
    (totals, { call, put }) => {
      totals.call += call.length ? call[call.length - 1] : 0;
      totals.put += put.length ? put[put.length - 1] : 0;
      return totals;
    },
    { call: 0, put: 0 },
  );
}

/**
 * Computes aggregated flow data with a fixed limit.
 * Aggregates the latest totals from each expiration and updates
 * the cumulative series.
 *
 * @param historical - The historical flow totals.
 * @param lastValue - The previous aggregated flow data (if any).
 * @param limit - The maximum number of data points to retain.
 * @returns The updated aggregated flow data.
 */
export function computeAggregatedFlowData(
  historical: HistoricalFlowTotals,
  lastValue: AggregatedFlowData | undefined,
  limit: number,
): AggregatedFlowData {
  // Compute new totals from historical data.
  const { call: newCallTotal, put: newPutTotal } = getLatestTotals(historical);

  // Copy previous arrays or initialize empty ones.
  const aggCalls = lastValue ? [...lastValue.calls] : [];
  const aggPuts = lastValue ? [...lastValue.puts] : [];
  const cumValues = lastValue ? [...lastValue.cumulative] : [];

  // Get the last cumulative value or default to 0.
  const lastCumulative = cumValues.length > 0 ? cumValues[cumValues.length - 1] : 0;
  const newCumulative = lastCumulative + (newCallTotal - newPutTotal);

  // Append the new totals.
  aggCalls.push(newCallTotal);
  aggPuts.push(newPutTotal);
  cumValues.push(newCumulative);

  // Return only the last `limit` items for each array.
  return {
    calls: aggCalls.slice(-limit),
    puts: aggPuts.slice(-limit),
    cumulative: cumValues.slice(-limit),
  };
}

/**
 * Computes cumulative money flow for calls and puts, grouped by strike price.
 * Each update to the flows will result in new cumulative sums being appended
 * to the respective arrays for each strike. The history size is limited by maxHistorySize.
 */
export function computeCumulativeFlowsByStrike(
  flows: OptionsFlowAnalytics[],
  lastValue: CumulativeFlowsByStrike | undefined,
  maxHistorySize: number,
): CumulativeFlowsByStrike | undefined {
  const currentTickStrikeDeltas: Record<string, { callDelta: number; putDelta: number }> = {};
  for (const flow of flows) {
    const strikeStr = String(flow.strike);
    if (!currentTickStrikeDeltas[strikeStr]) {
      currentTickStrikeDeltas[strikeStr] = { callDelta: 0, putDelta: 0 };
    }
    if (flow.type === 'call') {
      currentTickStrikeDeltas[strikeStr].callDelta += flow.moneyFlow;
    } else if (flow.type === 'put') {
      currentTickStrikeDeltas[strikeStr].putDelta += flow.moneyFlow;
    }
  }

  const newCumulativeState: CumulativeFlowsByStrike = {};
  const allStrikeKeys = new Set<string>();
  if (lastValue) {
    Object.keys(lastValue).forEach(key => allStrikeKeys.add(key));
  }
  Object.keys(currentTickStrikeDeltas).forEach(key => allStrikeKeys.add(key));

  if (allStrikeKeys.size === 0 && flows.length === 0) {
    return lastValue ?? undefined;
  }

  const periods = [5, 8, 10, 20, 30, 40, 50];
  for (const strikeStr of allStrikeKeys) {
    const prevAgg = lastValue?.[strikeStr];
    const { callDelta: newCall, putDelta: newPut } = currentTickStrikeDeltas[strikeStr] ?? {
      callDelta: 0,
      putDelta: 0,
    };

    const prevCalls = prevAgg?.calls ?? [];
    const prevPuts = prevAgg?.puts ?? [];
    const prevCumulative = prevAgg?.cumulative ?? [];
    // Ensure other cumulative arrays are also initialized if they existed previously,
    // though computeMovingSum will generate new ones based on the current diff.
    // This is more for completeness if we were to carry forward other properties.
    // const prevCumulative5 = prevAgg?.cumulative5 ?? [];
    // ... and so on for 8, 10, 20, 30, 40, 50

    const updatedCalls = [...prevCalls, newCall].slice(-maxHistorySize);
    const updatedPuts = [...prevPuts, newPut].slice(-maxHistorySize);

    const lastCum = prevCumulative.length > 0 ? prevCumulative[prevCumulative.length - 1] : 0;
    const updatedCumulative = [...prevCumulative, lastCum + (newCall - newPut)].slice(
      -maxHistorySize,
    );

    // Build the diff array from the *updated* and *sliced* call/put arrays
    const diff = updatedCalls.map((c, i) => c - updatedPuts[i]);

    // Compute moving‐window sums for each period
    // These will also be implicitly limited by maxHistorySize due to `diff`'s length
    const movingSums = computeMultipleMovingSums(diff, periods);

    newCumulativeState[strikeStr] = {
      calls: updatedCalls,
      puts: updatedPuts,
      cumulative: updatedCumulative,
      ...movingSums,
    };
  }
  return newCumulativeState;
}

export function computeCumulativeFlowsByExpirationAndStrike(
  allFlows: OptionsFlowAnalytics[],
  instruments: Record<string, IOptionsInstrument> | undefined,
  lastValue: CumulativeFlowsByExpirationAndStrike | undefined,
  maxHistorySize: number,
): CumulativeFlowsByExpirationAndStrike | undefined {
  if (!instruments) {
    return lastValue ?? undefined;
  }
  const flowsByExpiration: Record<string, OptionsFlowAnalytics[]> = {};
  for (const flow of allFlows) {
    const instrument = instruments[flow.instrumentId];
    if (instrument) {
      const expDate = instrument.expiration_date;
      if (!flowsByExpiration[expDate]) {
        flowsByExpiration[expDate] = [];
      }
      flowsByExpiration[expDate].push(flow);
    }
  }
  const newResultState: CumulativeFlowsByExpirationAndStrike = {};
  const allExpirationDates = new Set<string>();
  if (lastValue) {
    Object.keys(lastValue).forEach(date => allExpirationDates.add(date));
  }
  Object.keys(flowsByExpiration).forEach(date => allExpirationDates.add(date));
  if (allExpirationDates.size === 0 && allFlows.length === 0) {
    return lastValue ?? undefined;
  }
  for (const expDate of allExpirationDates) {
    const currentExpirationFlows = flowsByExpiration[expDate] ?? [];
    const lastExpirationStrikeData = lastValue?.[expDate];
    const newStrikeData = computeCumulativeFlowsByStrike(
      currentExpirationFlows,
      lastExpirationStrikeData,
      maxHistorySize,
    );
    if (newStrikeData && Object.keys(newStrikeData).length > 0) {
      newResultState[expDate] = newStrikeData;
    } else if (
      lastExpirationStrikeData &&
      Object.keys(lastExpirationStrikeData).length > 0 &&
      currentExpirationFlows.length === 0
    ) {
      const preservedStrikeData = computeCumulativeFlowsByStrike(
        [],
        lastExpirationStrikeData,
        maxHistorySize,
      );
      if (preservedStrikeData && Object.keys(preservedStrikeData).length > 0) {
        newResultState[expDate] = preservedStrikeData;
      }
    }
  }
  return newResultState;
}

/**
 * Calculates intrinsic value of an option
 * Based on strike price and current market price
 */
export function calculateIntrinsicValue(
  instrument: IOptionsInstrument,
  lastTradePrice: number,
): number {
  const strikePrice = parseFloat(instrument.strike_price);
  return instrument.type === 'call'
    ? Math.max(lastTradePrice - strikePrice, 0)
    : Math.max(strikePrice - lastTradePrice, 0);
}

/**
 * Calculates extrinsic (time) value of an option
 * Based on market price minus intrinsic value
 */
export function calculateExtrinsicValue(
  marketData: IOptionsMarketData,
  intrinsicValue: number,
): number {
  const lastTradePrice = parseFloat(String(marketData.last_trade_price));
  return Math.max(lastTradePrice - intrinsicValue, 0);
}

/**
 * Calculates money flow based on extrinsic value and volume
 * Used to measure option activity significance
 */
export function calculateMoneyFlow(extrinsicValue: number, volume: number): number {
  if (!Number.isFinite(extrinsicValue) || !Number.isFinite(volume)) {
    return 0;
  }
  return extrinsicValue * volume;
}
