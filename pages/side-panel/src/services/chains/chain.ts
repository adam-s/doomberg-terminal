import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IReader } from 'vs/base/common/observable';
import { observableValue } from 'vs/base/common/observableInternal/base';
import { IRequestService } from '@shared/services/request.service';
import {
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
} from '@shared/services/request.types';
import { ChainConfig } from './config';

export type OptionType = 'call' | 'put' | 'both';

export interface IInstrumentFilter {
  type: 'count' | 'range';
  value: number;
}

export class Chain extends Disposable {
  // Cache and timer handles
  private _instrumentsCache = new Map<string, Map<'call' | 'put', IOptionsInstrument[]>>();
  private _lastInstrumentsFetchDate: string | null = null;
  private _cachedActiveInstrument?: string;
  private _updateCounter = 0;
  private _lastCounterResetDate = new Date().toDateString();
  private _quoteUpdateHandle: NodeJS.Timeout | null = null;
  private _refreshIntervalHandle: NodeJS.Timeout | null = null;
  private _marketDataUpdatesDisposer: IDisposable | null = null;

  // Internal observables
  private readonly _quoteUpdateInterval$ = observableValue<number>('quoteUpdateInterval', 200);
  private readonly _refreshInterval$ = observableValue<number>('refreshInterval', 2500);
  private readonly _instrumentsFiltered$ = derived((reader: IReader) => {
    const instruments = this.instruments$.read(reader);
    const lastTradePrice = this.lastTradePrice$.get();
    const filter = this.instrumentFilter$.read(reader);

    if (!lastTradePrice || instruments.size === 0) return instruments;

    const filteredMap = new Map<string, Map<'call' | 'put', IOptionsInstrument[]>>();
    instruments.forEach((dateMap, date) => {
      const newDateMap = new Map<'call' | 'put', IOptionsInstrument[]>();
      dateMap.forEach((list, type) => {
        newDateMap.set(type, this._filterInstrumentsByPrice(list, lastTradePrice, filter));
      });
      filteredMap.set(date, newDateMap);
    });
    return filteredMap;
  });

  // Public observables
  public readonly chain$ = observableValue<IOptionsChain | undefined>('chain', undefined);
  public readonly selectedDates$ = observableValue<string[]>('selectedDates', []);
  public readonly optionType$ = observableValue<OptionType>('optionType', 'both');
  public readonly instruments$ = observableValue<
    Map<string, Map<'call' | 'put', IOptionsInstrument[]>>
  >('instruments', new Map());
  public readonly marketData$ = observableValue<Map<string, IOptionsMarketData>>(
    'marketData',
    new Map(),
  );
  public readonly quote$ = observableValue<{ bid_price: string } | undefined>('quote', undefined);
  public readonly instrumentFilter$ = observableValue<IInstrumentFilter>('instrumentFilter', {
    type: 'count',
    value: ChainConfig.DEFAULT_STRIKE_COUNT,
  });

  public readonly lastTradePrice$ = derived((reader: IReader) => {
    const quote = this.quote$.read(reader);
    return quote ? parseFloat(quote.bid_price) : undefined;
  });

  public readonly allInstruments$ = derived((reader: IReader) => {
    const instruments = this.instruments$.read(reader);
    const result: Record<string, IOptionsInstrument> = {};
    instruments.forEach(dateMap =>
      dateMap.forEach(list => list.forEach(instr => (result[instr.id] = instr))),
    );
    return result;
  });

  public readonly expirationDates$ = derived(
    (reader: IReader) => this.chain$.read(reader)?.expiration_dates ?? [],
  );

  constructor(
    public readonly symbol: string,
    @IRequestService private readonly requestService: IRequestService,
  ) {
    super();
    this._fetchInitialChain();
    this._registerAutoruns();
    this._registerRefreshIntervalHandler();
    this._registerLastTradePriceUpdates();
  }

  public async fetchChain(): Promise<void> {
    try {
      const response = await this.requestService.fetchOptionsChains(this.symbol);
      const [firstChain] = response.results;
      if (firstChain) {
        const currentChain = this.chain$.get();
        if (!currentChain || currentChain.id !== firstChain.id) {
          this.chain$.set(firstChain, undefined);
        }
      } else {
        this.chain$.set(undefined, undefined);
      }
    } catch (error) {
      console.error('Error fetching chain:', this.symbol, error);
      this.chain$.set(undefined, undefined);
    }
  }

  private _fetchInitialChain(): void {
    void this.fetchChain();
  }

  private async _getActiveInstrument(): Promise<string> {
    if (this._cachedActiveInstrument) return this._cachedActiveInstrument;
    const response = await this.requestService.fetchActiveInstruments(this.symbol);
    const instrument = response.results[0];
    if (!instrument) throw new Error(`Instrument not found for ${this.symbol}`);
    this._cachedActiveInstrument = instrument.id;
    return instrument.id;
  }

  public async updateMarketDataQuotes(): Promise<void> {
    try {
      const instrumentId = await this._getActiveInstrument();
      const quoteResponse = await this.requestService.fetchMarketDataQuotes(instrumentId);
      const quote = quoteResponse.results[0];
      if (!quote) {
        throw new Error(`Quote not found for ${this.symbol}`);
      }
      this.quote$.set(quote, undefined);
    } catch (error) {
      console.error('Error fetching quote:', this.symbol, error);
    }
  }

  public setQuoteUpdateInterval(interval: number): void {
    this._quoteUpdateInterval$.set(interval, undefined);
  }

  private _clearQuoteUpdateInterval(): void {
    if (this._quoteUpdateHandle) {
      clearInterval(this._quoteUpdateHandle);
      this._quoteUpdateHandle = null;
    }
  }

  private _registerLastTradePriceUpdates(): void {
    this._register(
      autorun((reader: IReader) => {
        const interval = this._quoteUpdateInterval$.read(reader);
        this._clearQuoteUpdateInterval();
        this._quoteUpdateHandle = setInterval(() => void this.updateMarketDataQuotes(), interval);
      }),
    );
  }

  private _shouldRefetchInstruments(): boolean {
    const today = new Date().toDateString();
    if (this._lastInstrumentsFetchDate !== today) {
      this._lastInstrumentsFetchDate = today;
      this._instrumentsCache.clear();
      return true;
    }
    return false;
  }

  private async _fetchInstrumentsWithCursor(
    chainId: string,
    date: string,
    optionType: 'call' | 'put',
    cursor?: string,
    accumulator: IOptionsInstrument[] = [],
  ): Promise<IOptionsInstrument[]> {
    const response = await this.requestService.fetchOptionsInstruments(
      chainId,
      date,
      optionType,
      cursor,
    );

    const allInstruments = [...accumulator, ...response.results];

    if (response.next) {
      return this._fetchInstrumentsWithCursor(
        chainId,
        date,
        optionType,
        response.next,
        allInstruments,
      );
    }

    return allInstruments;
  }

  public async fetchOptionsInstruments(dates: string[], type: OptionType): Promise<void> {
    if (dates.length === 0) {
      this.instruments$.set(new Map(), undefined);
      return;
    }
    const chain = this.chain$.get();
    if (!chain) return;

    const instrumentsMap = new Map<string, Map<'call' | 'put', IOptionsInstrument[]>>();
    const needsFetch = this._shouldRefetchInstruments();

    const fetchByType = async (optionType: 'call' | 'put') => {
      for (const date of dates) {
        const cached = this._instrumentsCache.get(date)?.get(optionType);
        if (!needsFetch && cached) {
          if (!instrumentsMap.has(date)) {
            instrumentsMap.set(date, new Map());
          }
          instrumentsMap.get(date)!.set(optionType, cached);
          continue;
        }

        const instruments = await this._fetchInstrumentsWithCursor(chain.id, date, optionType);
        if (!instrumentsMap.has(date)) {
          instrumentsMap.set(date, new Map());
        }
        instrumentsMap.get(date)!.set(optionType, instruments);
        if (!this._instrumentsCache.has(date)) {
          this._instrumentsCache.set(date, new Map());
        }
        this._instrumentsCache.get(date)!.set(optionType, instruments);
      }
    };

    try {
      if (type === 'both') {
        await Promise.all([fetchByType('call'), fetchByType('put')]);
      } else {
        await fetchByType(type);
      }
      this.instruments$.set(instrumentsMap, undefined);
    } catch (error) {
      console.error('Error fetching instruments:', this.symbol, error);
      this.instruments$.set(new Map(), undefined);
    }
  }

  private _filterInstrumentsByPrice(
    instruments: IOptionsInstrument[],
    lastTradePrice: number,
    filter: IInstrumentFilter,
  ): IOptionsInstrument[] {
    const sorted = [...instruments].sort(
      (a, b) =>
        Math.abs(parseFloat(a.strike_price) - lastTradePrice) -
        Math.abs(parseFloat(b.strike_price) - lastTradePrice),
    );
    if (filter.type === 'count') {
      return sorted.slice(0, filter.value);
    }
    const minPrice = lastTradePrice - filter.value;
    const maxPrice = lastTradePrice + filter.value;
    return sorted.filter(instr => {
      const strike = parseFloat(instr.strike_price);
      return strike >= minPrice && strike <= maxPrice;
    });
  }

  public getInstrumentsByDate(date: string): Map<'call' | 'put', IOptionsInstrument[]> | undefined {
    return this.instruments$.get().get(date);
  }

  public getInstrumentsByDateAndType(
    date: string,
    type: 'call' | 'put',
  ): IOptionsInstrument[] | undefined {
    return this.instruments$.get().get(date)?.get(type);
  }

  private async _fetchAndUpdateMarketData(): Promise<void> {
    try {
      const today = new Date().toDateString();
      if (this._lastCounterResetDate !== today) {
        this._updateCounter = 0;
        this._lastCounterResetDate = today;
      }
      const marketData = await this.fetchOptionsMarketData();
      this.marketData$.set(marketData, undefined);
      this._updateCounter++;
    } catch (error) {
      console.error('Error fetching market data:', this.symbol, error);
      this.marketData$.set(new Map(), undefined);
    }
  }

  public async fetchOptionsMarketData(): Promise<Map<string, IOptionsMarketData>> {
    const instrumentIds = new Set<string>();
    const filtered = this._instrumentsFiltered$.get();
    filtered.forEach(dateMap =>
      dateMap.forEach(list => list.forEach(instr => instrumentIds.add(instr.id))),
    );
    const idsArray = Array.from(instrumentIds);
    const batches: string[][] = [];
    for (let i = 0, len = idsArray.length; i < len; i += 40) {
      batches.push(idsArray.slice(i, i + 40));
    }
    const marketDataMap = new Map<string, IOptionsMarketData>();
    for (const batch of batches) {
      const response = await this.requestService.fetchOptionsMarketData(batch);
      for (const data of response.results) {
        if (data?.instrument_id) {
          marketDataMap.set(data.instrument_id, data);
        }
      }
    }
    return marketDataMap;
  }

  private _registerAutoruns(): void {
    this._register(
      autorun((reader: IReader) => {
        const chain = this.chain$.read(reader);
        const dates = this.selectedDates$.read(reader);
        const optionType = this.optionType$.read(reader);
        if (chain && dates.length > 0) {
          const currentDates = [...dates];
          void this.fetchOptionsInstruments(currentDates, optionType);
        } else {
          this.instruments$.set(new Map(), undefined);
          this.marketData$.set(new Map(), undefined);
        }
      }),
    );
  }

  private _registerRefreshIntervalHandler(): void {
    this._register(
      autorun((reader: IReader) => {
        const interval = this._refreshInterval$.read(reader);
        this._clearRefreshInterval();
        this._refreshIntervalHandle = setInterval(() => {
          if (this._marketDataUpdatesDisposer) {
            void this._fetchAndUpdateMarketData();
          }
        }, interval);
      }),
    );
  }

  private _clearRefreshInterval(): void {
    if (this._refreshIntervalHandle) {
      clearInterval(this._refreshIntervalHandle);
      this._refreshIntervalHandle = null;
    }
  }

  public startMarketDataUpdates(): void {
    if (this._marketDataUpdatesDisposer) return;
    if (!this.quote$.get()) void this.updateMarketDataQuotes();
    this._marketDataUpdatesDisposer = this._register(
      autorun((reader: IReader) => {
        const instrumentsMap = this.instruments$.read(reader);
        const lastTradePrice = this.lastTradePrice$.get();
        if (instrumentsMap.size === 0 || lastTradePrice === undefined) {
          this.marketData$.set(new Map(), undefined);
        }
      }),
    );
  }

  public stopMarketDataUpdates(): void {
    if (this._marketDataUpdatesDisposer) {
      this._marketDataUpdatesDisposer.dispose();
      this._marketDataUpdatesDisposer = null;
    }
  }

  public setSelectedDates(dates: string[]): void {
    const validDates = Array.isArray(dates) ? dates : [];
    this.selectedDates$.set(validDates, undefined);
    if (validDates.length === 0) {
      this.instruments$.set(new Map(), undefined);
      this.marketData$.set(new Map(), undefined);
    }
  }

  public setOptionType(type: OptionType): void {
    this.optionType$.set(type, undefined);
  }

  public setRefreshInterval(interval: number): void {
    this._refreshInterval$.set(interval, undefined);
  }

  public setInstrumentFilter(filter: IInstrumentFilter): void {
    this.instrumentFilter$.set(filter, undefined);
  }

  public override dispose(): void {
    this._clearQuoteUpdateInterval();
    this.stopMarketDataUpdates();
    this._clearRefreshInterval();
    super.dispose();
  }
}
