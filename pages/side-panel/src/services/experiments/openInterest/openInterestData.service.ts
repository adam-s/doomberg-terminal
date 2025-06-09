import { Disposable } from 'vs/base/common/lifecycle';
import { IRequestService } from '@shared/services/request.service';
import {
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
} from '@shared/services/request.types';
export interface OpenInterestSymbolData {
  dates: OpenInterestDateData;
  lastTradePrice: number;
}

export interface OpenInterestStrike {
  strikePrice: number;
  openInterest: number;
}

export interface OpenInterestDateData {
  call: OpenInterestStrike[];
  put: OpenInterestStrike[];
}

export interface OpenInterestData {
  [symbol: string]: {
    lastTradePrice: number;
    dates: {
      [date: string]: OpenInterestDateData;
    };
  };
}

export interface CombinedStrikeData {
  strikePrice: number;
  callOpenInterest: number;
  putOpenInterest: number;
}

// Remove the duplicate interface definitions since they're now imported
interface OpenInterestDataOptions {
  expirationDateCount: number;
}

interface RawData {
  chain: IOptionsChain;
  instruments: Record<string, IOptionsInstrument>;
  marketData: Record<string, IOptionsMarketData>;
}

const PRICE_RANGE = 30; // Dollar range above and below last trade price
const isDevelopment = process.env.NODE_ENV === 'development';
const serverUrl = 'http://localhost:3000';

export class OpenInterestDataService extends Disposable {
  private readonly defaultOptions: OpenInterestDataOptions = {
    expirationDateCount: 3,
  };

  private readonly options: OpenInterestDataOptions;

  constructor(
    options: Partial<OpenInterestDataOptions>,
    @IRequestService private readonly requestService: IRequestService,
  ) {
    super();
    this.options = { ...this.defaultOptions, ...options };
  }

  private async fetchChains(symbols: string[]): Promise<IOptionsChain[]> {
    const results: IOptionsChain[] = [];

    for (const symbol of symbols) {
      const response = await this.requestService.fetchOptionsChains(symbol);
      if (response.results.length > 0) {
        results.push(response.results[0]);
      }
    }

    return results;
  }

  private async fetchInstruments(
    chainId: string,
    date: string,
    type: 'call' | 'put',
  ): Promise<IOptionsInstrument[]> {
    const response = await this.requestService.fetchOptionsInstruments(chainId, date, type);
    return response.results;
  }

  private async fetchMarketData(instrumentIds: string[]): Promise<Map<string, IOptionsMarketData>> {
    const marketDataMap = new Map<string, IOptionsMarketData>();
    const batches: string[][] = [];

    // Split instrument IDs into batches of 40
    for (let i = 0; i < instrumentIds.length; i += 40) {
      batches.push(instrumentIds.slice(i, i + 40));
    }

    // Fetch market data batch by batch
    for (const batch of batches) {
      const response = await this.requestService.fetchOptionsMarketData(batch);
      for (const data of response.results) {
        if (data && data.instrument_id) {
          marketDataMap.set(data.instrument_id, data);
        }
      }
    }

    return marketDataMap;
  }

  private async sendToDevServer(date: string, symbol: string, rawData: RawData): Promise<void> {
    if (!isDevelopment) return;

    await fetch(`${serverUrl}/open-interest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        date,
        symbol,
        ...rawData, // Spread the raw data (chain, instruments, marketData)
      }),
    });
  }

  private async checkDevServer(
    date: string,
    symbol: string,
    bustCache = false,
  ): Promise<RawData | null> {
    if (!isDevelopment || bustCache) return null;

    try {
      const response = await fetch(`${serverUrl}/open-interest/?date=${date}&symbol=${symbol}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  private getCacheDate(): string {
    const now = new Date();
    const estHour = now.getUTCHours() - 5; // ignoring DST
    const isBefore830 = estHour < 8 || (estHour === 8 && now.getUTCMinutes() < 30);
    const target = new Date(now.getTime() - (isBefore830 ? 86400000 : 0));
    const year = target.getUTCFullYear();
    const month = String(target.getUTCMonth() + 1).padStart(2, '0');
    const day = String(target.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async fetchLastTradePrice(symbol: string): Promise<number> {
    const response = await this.requestService.fetchActiveInstruments(symbol);
    const instrument = response.results[0];
    if (!instrument) throw new Error(`Instrument not found for ${symbol}`);

    const quoteResponse = await this.requestService.fetchMarketDataQuotes(instrument.id);
    const quote = quoteResponse.results[0];
    if (!quote) throw new Error(`Quote not found for ${symbol}`);

    return parseFloat(quote.bid_price);
  }

  private filterStrikesAroundPrice(
    strikes: OpenInterestStrike[],
    lastTradePrice: number,
  ): OpenInterestStrike[] {
    const sortedStrikes = [...strikes].sort((a, b) => a.strikePrice - b.strikePrice);

    // Filter strikes that are within +/- PRICE_RANGE of lastTradePrice
    return sortedStrikes.filter(
      strike =>
        strike.strikePrice >= lastTradePrice - PRICE_RANGE &&
        strike.strikePrice <= lastTradePrice + PRICE_RANGE,
    );
  }

  public async getOpenInterestData(
    symbols: string | string[],
    bustCache = false,
  ): Promise<OpenInterestData> {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    const cacheDate = this.getCacheDate();
    const result: OpenInterestData = {};

    await Promise.all(
      symbolArray.map(async symbol => {
        const [rawData, lastTradePrice] = await Promise.all([
          this.fetchSymbolData(cacheDate, symbol, bustCache),
          this.fetchLastTradePrice(symbol),
        ]);

        if (!rawData) return;

        result[symbol] = {
          lastTradePrice,
          dates: {},
        };

        const dates = rawData.chain.expiration_dates.slice(0, this.options.expirationDateCount);

        dates.forEach(date => {
          result[symbol].dates[date] = {
            call: [],
            put: [],
          };

          // Process instruments and market data for this date
          Object.entries(rawData.instruments).forEach(([id, instrument]) => {
            if (instrument.expiration_date !== date) return;

            const marketData = rawData.marketData[id];
            if (!marketData) return;

            const openInterestStrike: OpenInterestStrike = {
              strikePrice: parseFloat(instrument.strike_price),
              openInterest: marketData.open_interest || 0,
            };

            result[symbol].dates[date][instrument.type].push(openInterestStrike);
          });

          // Filter strikes around lastTradePrice after collecting all data for this date
          result[symbol].dates[date].call = this.filterStrikesAroundPrice(
            result[symbol].dates[date].call,
            lastTradePrice,
          );
          result[symbol].dates[date].put = this.filterStrikesAroundPrice(
            result[symbol].dates[date].put,
            lastTradePrice,
          );
        });
      }),
    );

    return result;
  }

  private async fetchSymbolData(
    date: string,
    symbol: string,
    bustCache = false,
  ): Promise<RawData | null> {
    // Try cache first if not busting cache
    if (!bustCache) {
      const cachedData = await this.checkDevServer(date, symbol);
      if (cachedData) {
        return cachedData;
      }
    }

    // Fetch fresh if not cached
    const rawData = await this.fetchAndCacheData(date, symbol);
    return rawData;
  }

  private async fetchAndCacheData(date: string, symbol: string): Promise<RawData> {
    // 1. Get chain data
    const chain = await this.fetchChains([symbol]);
    if (!chain[0]) throw new Error(`No chain data for symbol ${symbol}`);

    // 2. Get instruments for expiration dates
    const instruments = await this.fetchInstrumentsForDates(
      chain[0].id,
      chain[0].expiration_dates.slice(0, this.options.expirationDateCount),
    );

    // 3. Get market data for instruments
    const marketData = await this.fetchMarketData(Object.keys(instruments));

    // 4. Create and cache the raw data
    const rawData: RawData = {
      chain: chain[0],
      instruments,
      marketData: Object.fromEntries(marketData),
    };

    await this.sendToDevServer(date, symbol, rawData);
    return rawData;
  }

  private async fetchInstrumentsForDates(
    chainId: string,
    dates: string[],
  ): Promise<Record<string, IOptionsInstrument>> {
    const instruments: Record<string, IOptionsInstrument> = {};

    await Promise.all(
      dates.flatMap(date =>
        ['call' as const, 'put' as const].map(async type => {
          const response = await this.fetchInstruments(chainId, date, type);
          response.forEach(instrument => {
            instruments[instrument.id] = instrument;
          });
        }),
      ),
    );

    return instruments;
  }
}
