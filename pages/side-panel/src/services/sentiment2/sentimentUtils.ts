import { IOptionsInstrument, IOptionsMarketData } from '@shared/services/request.types';
/**
 * Functions from this module called by other files:
 * - processMarketData
 * - groupMarketDataByExpiration
 * - pairOptions
 * - calculateSentiment
 * - calculateCurrentSMA
 * - calculateSMAHistory
 * - calculateEMAHistory
 * - didSmaStateMapChange
 * - createVolatilitySkewPoints
 */
// Interface for market data items used in pairing logic
export interface IMarketDataItem {
  id: string;
  strikePrice: string;
  askPrice: string;
  bidPrice: string;
  delta: string;
  impliedVolatility: string;
  expirationDate: string;
  volume: number;
}

// Interface for paired option data
export interface IPairedOptionData {
  callStrike: string;
  putStrike: string;
  callDelta: number;
  putDelta: number;
  callIV: number;
  putIV: number;
  deltaMatch: number;
  ivDifference: number;
}

// Interface for a single point on the volatility skew chart
export interface IVolatilitySkewPoint {
  strike: number;
  callIV: number;
  putIV: number;
  smaCallIV: number;
  smaPutIV: number;
  callDelta: number;
  putDelta: number;
}

// Interface to store the state needed for SMA calculation per strike
export interface ISmaState {
  callIVHistory: number[];
  putIVHistory: number[];
}

// Define option types enum with lowercase to match IOptionsInstrument type property
export enum OptionType {
  CALL = 'call',
  PUT = 'put',
}

// Enum for strike selection mode
export enum StrikeSelectionMode {
  ITM = 'itm',
  OTM = 'otm',
  BOTH = 'both',
}

// Define data point structure for sentiment history
export interface SentimentDataPoint {
  timestamp: number;
  value: number;
}

// Define data point structure for SMA history
export interface SMADataPoint {
  timestamp: number;
  value: number | null;
}

/**
 * Configuration settings for sentiment calculations
 */
export interface BaseSentimentDataConfig {
  maxHistorySize: number;
  numStrikes: number;
  period: number;
  sentimentBeta?: number;
  sentimentMaxDeltaMatch?: number;
  volumeWeight?: number;
  normalizeByATM?: boolean;
  strikeSelectionMode?: StrikeSelectionMode;
}

export type SentimentDataConfig = BaseSentimentDataConfig;

/**
 * Default configuration values for sentiment calculations
 */
export const DEFAULT_CONFIG: BaseSentimentDataConfig = {
  maxHistorySize: 500,
  numStrikes: 40,
  period: 10,
  sentimentBeta: 0.2,
  sentimentMaxDeltaMatch: 0.85,
  volumeWeight: 0.85,
  normalizeByATM: false,
  strikeSelectionMode: StrikeSelectionMode.BOTH,
};

/**
 * Processes instruments and market data for a specific option type
 */
export function processMarketData(
  instruments: Record<string, IOptionsInstrument> | undefined,
  marketData: Map<string, IOptionsMarketData> | undefined,
  optionType: OptionType,
  currentPrice?: number,
  numStrikes?: number,
  strikeSelectionMode?: StrikeSelectionMode,
): IMarketDataItem[] {
  if (!instruments || !marketData || currentPrice === undefined) {
    return [];
  }

  // Filter instruments by option type
  const instrumentArray = Object.values(instruments).filter(instr => instr.type === optionType);

  // Filter strikes around the current price
  const filteredInstruments = filterInstrumentsAroundPrice(
    instrumentArray,
    currentPrice,
    numStrikes ?? DEFAULT_CONFIG.numStrikes,
    optionType,
    strikeSelectionMode ?? DEFAULT_CONFIG.strikeSelectionMode,
  );

  // Map instruments to market data items
  return filteredInstruments
    .reduce<IMarketDataItem[]>((acc, instrument) => {
      const data = marketData.get(instrument.id);
      // Ensure data exists and has necessary fields
      if (
        !data ||
        !data.delta ||
        !data.implied_volatility ||
        !data.ask_price ||
        !data.bid_price ||
        !data.volume
      ) {
        return acc;
      }

      acc.push({
        id: instrument.id,
        strikePrice: instrument.strike_price,
        askPrice: data.ask_price,
        bidPrice: data.bid_price,
        delta: data.delta,
        impliedVolatility: data.implied_volatility,
        expirationDate: instrument.expiration_date,
        volume: data.volume,
      });

      return acc;
    }, [])
    .sort((a, b) => parseFloat(b.strikePrice) - parseFloat(a.strikePrice)); // Sort descending by strike
}

/**
 * Filters instruments to include ITM, OTM, or both types of options around the current price
 * based on the strikeSelectionMode configuration
 */
export function filterInstrumentsAroundPrice(
  instruments: IOptionsInstrument[],
  currentPrice: number,
  numStrikesOneDirection: number,
  optionType: OptionType,
  strikeMode: StrikeSelectionMode = StrikeSelectionMode.BOTH,
): IOptionsInstrument[] {
  if (!instruments.length) {
    return [];
  }

  // Sort instruments by strike price (ascending)
  const sortedInstruments = [...instruments].sort(
    (a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price),
  );

  // Find the pivot index where strike price crosses current price
  let pivotIndex = 0;

  // Find the index of the first strike price >= current price
  for (let i = 0; i < sortedInstruments.length; i++) {
    if (parseFloat(sortedInstruments[i].strike_price) >= currentPrice) {
      pivotIndex = i;
      break;
    }
    if (i === sortedInstruments.length - 1) {
      pivotIndex = sortedInstruments.length;
    }
  }

  let startIndex: number;
  let endIndex: number;

  // ITM and OTM are defined differently for calls and puts:
  // For calls: ITM = strike < price, OTM = strike > price
  // For puts: ITM = strike > price, OTM = strike < price
  if (optionType === OptionType.CALL) {
    if (strikeMode === StrikeSelectionMode.ITM) {
      // Only ITM calls (strikes below current price)
      startIndex = Math.max(0, pivotIndex - numStrikesOneDirection * 2);
      endIndex = Math.max(0, pivotIndex - 1);
    } else if (strikeMode === StrikeSelectionMode.OTM) {
      // Only OTM calls (strikes above current price)
      startIndex = pivotIndex;
      endIndex = Math.min(
        sortedInstruments.length - 1,
        pivotIndex + numStrikesOneDirection * 2 - 1,
      );
    } else {
      // Both ITM and OTM (default behavior)
      startIndex = Math.max(0, pivotIndex - numStrikesOneDirection);
      endIndex = Math.min(sortedInstruments.length - 1, pivotIndex + numStrikesOneDirection - 1);
    }
  } else {
    if (strikeMode === StrikeSelectionMode.ITM) {
      // Only ITM puts (strikes above current price)
      startIndex = pivotIndex;
      endIndex = Math.min(
        sortedInstruments.length - 1,
        pivotIndex + numStrikesOneDirection * 2 - 1,
      );
    } else if (strikeMode === StrikeSelectionMode.OTM) {
      // Only OTM puts (strikes below current price)
      startIndex = Math.max(0, pivotIndex - numStrikesOneDirection * 2);
      endIndex = Math.max(0, pivotIndex - 1);
    } else {
      // Both ITM and OTM (default behavior)
      startIndex = Math.max(0, pivotIndex - numStrikesOneDirection);
      endIndex = Math.min(sortedInstruments.length - 1, pivotIndex + numStrikesOneDirection - 1);
    }
  }

  return sortedInstruments.slice(startIndex, endIndex + 1);
}

/**
 * Groups market data items by expiration date
 */
export function groupMarketDataByExpiration(
  items: IMarketDataItem[],
): Map<string, IMarketDataItem[]> {
  const grouped = new Map<string, IMarketDataItem[]>();

  for (const item of items) {
    const group = grouped.get(item.expirationDate) ?? [];
    group.push(item);
    grouped.set(item.expirationDate, group);
  }

  return grouped;
}

/**
 * Pairs call and put options based on either delta matching or moneyness levels
 */
export function pairOptions(
  calls: IMarketDataItem[],
  puts: IMarketDataItem[],
): IPairedOptionData[] {
  // Otherwise use the delta-matching approach
  return pairOptionsByDelta(calls, puts);
}

/**
 * Pairs call and put options based on the closest delta match
 */
export function pairOptionsByDelta(
  calls: IMarketDataItem[],
  puts: IMarketDataItem[],
): IPairedOptionData[] {
  const result: IPairedOptionData[] = [];

  // Convert calls array to array with numeric values
  const callsData = calls
    .map(call => ({
      strike: parseFloat(call.strikePrice),
      delta: parseFloat(call.delta),
      iv: parseFloat(call.impliedVolatility),
      strikeStr: call.strikePrice,
      volume: call.volume,
    }))
    .filter(call => !isNaN(call.delta) && !isNaN(call.iv));

  // Convert puts array to array with numeric values
  const putsData = puts
    .map(put => ({
      strike: parseFloat(put.strikePrice),
      delta: Math.abs(parseFloat(put.delta)), // Take absolute value of put delta
      iv: parseFloat(put.impliedVolatility),
      strikeStr: put.strikePrice,
      volume: put.volume,
    }))
    .filter(put => !isNaN(put.delta) && !isNaN(put.iv));

  // Check if we have valid data to pair
  if (!callsData.length || !putsData.length) {
    return [];
  }

  // For each call, find the put with the closest delta
  for (const call of callsData) {
    let bestMatch: { put: (typeof putsData)[0]; difference: number } | undefined;

    for (const put of putsData) {
      const difference = Math.abs(call.delta - put.delta);

      if (!bestMatch || difference < bestMatch.difference) {
        bestMatch = { put, difference };
      }
    }

    if (bestMatch) {
      result.push({
        callStrike: call.strikeStr,
        putStrike: bestMatch.put.strikeStr,
        callDelta: call.delta,
        putDelta: -bestMatch.put.delta, // Restore the negative sign
        callIV: call.iv,
        putIV: bestMatch.put.iv,
        deltaMatch: bestMatch.difference,
        ivDifference: call.iv - bestMatch.put.iv,
      });
    }
  }

  return result;
}

/**
 * Enhanced sentiment calculation that blends delta‐mismatch and normalized volume,
 * with volumeWeight ∈ [0,1] controlling the mix.
 */
export function calculateSentiment(
  pairs: IPairedOptionData[],
  config: Partial<SentimentDataConfig> = {},
): number {
  const beta = config.sentimentBeta ?? DEFAULT_CONFIG.sentimentBeta!;
  const maxDeltaMatch = config.sentimentMaxDeltaMatch ?? DEFAULT_CONFIG.sentimentMaxDeltaMatch!;
  const normalizeByATM = config.normalizeByATM ?? DEFAULT_CONFIG.normalizeByATM!;

  // If asked, find an ATM IV to normalize
  let atmIV = 1;
  if (normalizeByATM) {
    const atmPair = pairs.reduce(
      (best, cur) =>
        Math.abs(Math.abs(cur.callDelta) - 0.5) < Math.abs(Math.abs(best.callDelta) - 0.5)
          ? cur
          : best,
      pairs[0],
    );
    atmIV = (atmPair.callIV + atmPair.putIV) / 2 || 1;
  }

  // Build weighted (value, weight) tuples
  const scored = pairs
    .map(pair => {
      if (pair.deltaMatch > maxDeltaMatch) return null;

      // 1) delta‐mismatch weight
      const deltaWeight = Math.exp(-beta * pair.deltaMatch);

      // 3) blend them
      const weight = deltaWeight;

      // 4) raw IV diff, ATM‐normalized if desired
      let ivDiff = pair.ivDifference;
      if (normalizeByATM) ivDiff /= atmIV;

      return { weight, value: ivDiff };
    })
    .filter((x): x is { weight: number; value: number } => x !== null && x.weight > 0);

  if (scored.length === 0) return 0;

  const sumW = scored.reduce((s, p) => s + p.weight, 0);
  const sumWV = scored.reduce((s, p) => s + p.weight * p.value, 0);

  return sumW > 0 ? sumWV / sumW : 0;
}

/**
 * Calculate Exponential Moving Average (EMA) from a given history.
 * IMPORTANT: This function, formerly `calculateSMA`, now computes EMA.
 * It determines the EMA for the most recent data point in the 'history' array.
 * The EMA calculation is seeded with the Simple Moving Average (SMA) of the initial 'period' data points from the history.
 * Subsequent EMA values are calculated iteratively over the remainder of the history.
 *
 * If 'history.length' is less than 'period', or if 'period' is not positive (<=0),
 * the function returns 0, as a meaningful EMA cannot be fully calculated under these conditions.
 * Note that if 'history.length' is exactly equal to 'period', the returned value will be the SMA of that history,
 * as this is the seed value for the EMA and no further iterative calculations apply.
 */
export function calculateSMA(history: number[], period: number): number {
  // Original comment: Calculate Simple Moving Average (SMA) from a given history

  if (history.length === 0) {
    return 0;
  }

  // EMA period must be positive for the smoothing factor calculation and SMA seeding.
  if (period <= 0) {
    return 0;
  }

  // Not enough data points to form the initial SMA seed based on 'period'.
  // The original SMA function would calculate an SMA over the available data.
  // For a standard EMA calculation seeded by an SMA of 'period' items, this isn't possible.
  if (history.length < period) {
    return 0;
  }

  // Calculate the smoothing factor (alpha) for EMA.
  const alpha = 2 / (period + 1);

  // Seed the EMA: Calculate the SMA of the first 'period' data points.
  // This SMA serves as the initial EMA value, corresponding to the data point at index 'period - 1'.
  const initialSlice = history.slice(0, period);
  let ema = initialSlice.reduce((sum, value) => sum + value, 0) / period;

  // Iteratively calculate EMA for the remaining data points in the history.
  // Start from the data point at index 'period', using the previously calculated 'ema'.
  for (let i = period; i < history.length; i++) {
    ema = history[i] * alpha + ema * (1 - alpha);
  }

  // The final 'ema' value is the Exponential Moving Average for the last data point in the history.
  return ema;
}

/**
 * Calculates the most recent SMA value from a series of sentiment data points.
 * Returns 0 if there are not enough data points for the specified period.
 */
export function calculateCurrentSMA(history: SentimentDataPoint[], period: number): number {
  if (period <= 0 || history.length < period) {
    return 0;
  }
  const slice = history.slice(-period);
  const sum = slice.reduce((acc, curr) => acc + curr.value, 0);
  return sum / period;
}

/**
 * Generates a history of SMA values from a series of sentiment data points.
 * Points before enough data is available will have a null value.
 */
export function calculateSMAHistory(history: SentimentDataPoint[], period: number): SMADataPoint[] {
  if (period <= 0) {
    return history.map(pt => ({ timestamp: pt.timestamp, value: null }));
  }
  return history.map((pt, i) => {
    if (i < period - 1) {
      return { timestamp: pt.timestamp, value: null };
    }
    const window = history.slice(i - period + 1, i + 1);
    const sum = window.reduce((s, x) => s + x.value, 0);
    return { timestamp: pt.timestamp, value: sum / period };
  });
}

/**
 * Generates a history of EMA values from a series of sentiment data points.
 * The first EMA value in the series is an SMA over the period.
 * Subsequent values are calculated using the EMA formula.
 */
export function calculateEMAHistory(history: SentimentDataPoint[], period: number): SMADataPoint[] {
  if (period <= 0) {
    return history.map(pt => ({ timestamp: pt.timestamp, value: null }));
  }
  const vals: (number | null)[] = []; // Stores the calculated EMA values for internal use
  const alpha = 2 / (period + 1);

  return history.map((pt, i) => {
    if (i < period - 1) {
      // Not enough data points yet for the first SMA (which is the first EMA point)
      vals.push(null);
      return { timestamp: pt.timestamp, value: null };
    }

    if (i === period - 1) {
      // Calculate initial SMA for the first EMA point
      const initialSlice = history.slice(0, period);
      // Ensure the slice is valid and has 'period' elements
      if (initialSlice.length < period) {
        vals.push(null);
        return { timestamp: pt.timestamp, value: null };
      }
      const sum = initialSlice.reduce((s, x) => s + x.value, 0);
      const initSMA = sum / period;
      vals.push(initSMA);
      return { timestamp: pt.timestamp, value: initSMA };
    }

    // For i > period - 1, calculate EMA
    const prevEMA = vals[i - 1]; // Get the EMA from the previous step

    // If prevEMA is null (e.g. initial points didn't have enough data),
    // use current point's value as the previous value to "seed" the EMA.
    // This makes EMA equal to pt.value if prevEMA was null.
    const effectivePrevValue = prevEMA ?? pt.value;

    const currentEMA = pt.value * alpha + effectivePrevValue * (1 - alpha);
    vals.push(currentEMA);
    return { timestamp: pt.timestamp, value: currentEMA };
  });
}

/**
 * Compare two SMA state maps to detect changes
 */
export function didSmaStateMapChange(
  map1: Map<string, Map<number, ISmaState>>,
  map2: Map<string, Map<number, ISmaState>>,
): boolean {
  // Basic check: different number of expirations
  if (map1.size !== map2.size) return true;

  for (const [exp, strikeMap1] of map1.entries()) {
    const strikeMap2 = map2.get(exp);
    // Expiration missing in map2 or different number of strikes
    if (!strikeMap2 || strikeMap1.size !== strikeMap2.size) return true;

    for (const strike of strikeMap1.keys()) {
      // Strike missing in map2
      if (!strikeMap2.has(strike)) return true;

      // For SMA we need to check if histories differ in length
      const state1 = strikeMap1.get(strike);
      const state2 = strikeMap2.get(strike);
      if (
        !state2 ||
        state1?.callIVHistory.length !== state2.callIVHistory.length ||
        state1?.putIVHistory.length !== state2.putIVHistory.length
      ) {
        return true;
      }
    }
  }

  // Check if map2 has keys not in map1
  for (const exp of map2.keys()) {
    if (!map1.has(exp)) return true;
  }

  return false; // No significant changes detected
}

/**
 * Creates volatility skew points from option pairs
 */
export function createVolatilitySkewPoints(
  pairs: IPairedOptionData[],
  smaState: Map<number, ISmaState> = new Map(),
  period: number = DEFAULT_CONFIG.period,
): {
  skewPoints: IVolatilitySkewPoint[];
  updatedSmaState: Map<number, ISmaState>;
} {
  const skewPoints: IVolatilitySkewPoint[] = [];
  const nextSmaState = new Map<number, ISmaState>();

  for (const pair of pairs) {
    const strike = parseFloat(pair.callStrike);
    if (isNaN(strike)) continue; // Skip invalid strikes

    const rawCallIV = pair.callIV;
    const rawPutIV = pair.putIV;

    // Get previous SMA state for this strike
    const prevState = smaState.get(strike) ?? {
      callIVHistory: [],
      putIVHistory: [],
    };

    // Update history (only keep 'period' length for SMA calculation)
    const newCallHistory = [...prevState.callIVHistory, rawCallIV].slice(-period);
    const newPutHistory = [...prevState.putIVHistory, rawPutIV].slice(-period);

    // Calculate SMA for Call IV and Put IV
    const smaCallIV = calculateSMA(newCallHistory, period);
    const smaPutIV = calculateSMA(newPutHistory, period);

    // Store the new state for the next calculation cycle
    nextSmaState.set(strike, {
      callIVHistory: newCallHistory,
      putIVHistory: newPutHistory,
    });

    skewPoints.push({
      strike,
      callIV: rawCallIV,
      putIV: rawPutIV,
      smaCallIV,
      smaPutIV,
      callDelta: pair.callDelta,
      putDelta: pair.putDelta,
    });
  }

  return {
    skewPoints: skewPoints.sort((a, b) => a.strike - b.strike),
    updatedSmaState: nextSmaState,
  };
}

/**
 * Calculates paired options grouped by their expiration date.
 */
export function calculatePairedOptionsByExpiration(
  calls: IMarketDataItem[],
  puts: IMarketDataItem[],
): Map<string, IPairedOptionData[]> {
  const grouped = new Map<string, IPairedOptionData[]>();
  const callsByExp = groupMarketDataByExpiration(calls);
  const putsByExp = groupMarketDataByExpiration(puts);
  const allExps = new Set([...callsByExp.keys(), ...putsByExp.keys()]);

  for (const exp of allExps) {
    const c = callsByExp.get(exp) ?? [];
    const p = putsByExp.get(exp) ?? [];
    if (c.length && p.length) {
      const pairs = pairOptions(c, p);
      if (pairs.length) grouped.set(exp, pairs);
    }
  }
  return grouped;
}

/**
 * Calculates sentiment for each expiration date from a map of paired options.
 */
export function calculateSentimentForEachExpiration(
  pairedOptionsByExpiration: Map<string, IPairedOptionData[]>,
  config: Partial<SentimentDataConfig>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [exp, pairs] of pairedOptionsByExpiration) {
    map.set(exp, calculateSentiment(pairs, config));
  }
  return map;
}

/**
 * Generates volatility skew points and the next SMA state for each expiration date.
 */
export function generateVolatilitySkewsAndNextSmaState(
  pairedOptionsByExpiration: Map<string, IPairedOptionData[]>,
  currentSmaStateByExpiration: Map<string, Map<number, ISmaState>>,
  period: number,
): {
  volatilitySkews: Map<string, IVolatilitySkewPoint[]>;
  nextSmaStateByExpiration: Map<string, Map<number, ISmaState>>;
} {
  const nextSmaState = new Map<string, Map<number, ISmaState>>();
  const resultSkews = new Map<string, IVolatilitySkewPoint[]>();

  for (const [exp, pairs] of pairedOptionsByExpiration) {
    const prevState = currentSmaStateByExpiration.get(exp) ?? new Map<number, ISmaState>();
    const { skewPoints, updatedSmaState } = createVolatilitySkewPoints(pairs, prevState, period);
    if (skewPoints.length) {
      resultSkews.set(exp, skewPoints);
      nextSmaState.set(exp, updatedSmaState);
    }
  }
  return { volatilitySkews: resultSkews, nextSmaStateByExpiration: nextSmaState };
}
