import { IRequestService } from '@shared/services/request.service';
import { Disposable } from 'vs/base/common/lifecycle';
import { IReader, observableValue, transaction } from 'vs/base/common/observableInternal/base';
import type {
  IActiveInstruments,
  IMarketDataQuotesResult,
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
} from '@shared/services/request.types';
import { autorun, derived } from 'vs/base/common/observable';
import { ITimerService } from '@src/services/timer.service';

export enum SymbolType {
  QQQ = 'QQQ',
  SPY = 'SPY',
}

export enum OptionType {
  CALL = 'CALL',
  PUT = 'PUT',
}

export interface IMarketDataItem {
  id: string;
  strikePrice: string;
  askPrice: string;
  delta: string;
  impliedVolatility: string;
  optionType: OptionType; // Add option type to identify CALL vs PUT
}

export class Chain extends Disposable {
  public readonly symbol: SymbolType;

  private readonly _refreshInterval: number = 5000;
  private readonly _chainTimerId: string;

  private readonly _chain$ = observableValue<IOptionsChain | undefined>('chain', undefined);
  private readonly _activeInstrument$ = observableValue<IActiveInstruments | undefined>(
    'activeInstrument',
    undefined,
  );

  // Keep the original option type observable for backward compatibility
  private readonly _optionType$ = observableValue<OptionType>('optionType', OptionType.CALL);
  public readonly optionType = derived(reader => this._optionType$.read(reader));

  private readonly _selectedExpirationDate$ = observableValue<string>('expirationDate', '');
  public readonly selectedExpirationDate = derived(reader =>
    this._selectedExpirationDate$.read(reader),
  );

  public readonly expirationDates = derived(reader => this._chain$.read(reader)?.expiration_dates);

  // Separate observables for CALL and PUT instruments
  private readonly _callOptionInstruments = observableValue<IOptionsInstrument[] | undefined>(
    'callOptionInstruments',
    undefined,
  );
  private readonly _putOptionInstruments = observableValue<IOptionsInstrument[] | undefined>(
    'putOptionInstruments',
    undefined,
  );

  private readonly _marketDataQuote = observableValue<IMarketDataQuotesResult | undefined>(
    'marketDataQuote',
    undefined,
  );
  public readonly askPrice$ = derived(reader => {
    const askPrice = this._marketDataQuote.read(reader)?.ask_price;
    return askPrice ? parseFloat(askPrice) : undefined;
  });

  // Separate observables for CALL and PUT market data
  private readonly _callOptionsMarketData = observableValue<IOptionsMarketData[] | undefined>(
    'callOptionsMarketData',
    undefined,
  );
  private readonly _putOptionsMarketData = observableValue<IOptionsMarketData[] | undefined>(
    'putOptionsMarketData',
    undefined,
  );

  // Derived observables for market data
  public readonly callMarketData$ = derived<IMarketDataItem[]>(reader =>
    this._createMarketDataItems(
      reader,
      this._callOptionInstruments,
      this._callOptionsMarketData,
      OptionType.CALL,
    ),
  );

  public readonly putMarketData$ = derived<IMarketDataItem[]>(reader =>
    this._createMarketDataItems(
      reader,
      this._putOptionInstruments,
      this._putOptionsMarketData,
      OptionType.PUT,
    ),
  );

  // Keep the original market data observable for backward compatibility
  public readonly marketData$ = derived<IMarketDataItem[]>(reader => {
    const optionType = this._optionType$.read(reader);
    return optionType === OptionType.CALL
      ? this.callMarketData$.read(reader)
      : this.putMarketData$.read(reader);
  });

  constructor(
    symbol: SymbolType = SymbolType.QQQ,
    optionType: OptionType = OptionType.CALL,
    @IRequestService private readonly requestService: IRequestService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();
    this.symbol = symbol;
    this.setOptionType(optionType);
    this._chainTimerId = `chain-refresh-${this.symbol}`;
    this.init().then(() => {
      this.startChainWatcher();
    });

    this._register(
      autorun(async reader => {
        const chain = this._chain$.read(reader);
        const expirationDate = this._selectedExpirationDate$.read(reader);
        if (!chain?.id || !expirationDate) {
          return undefined;
        }

        // Fetch both CALL and PUT option instruments in parallel
        const [callInstruments, putInstruments] = await Promise.all([
          this._fetchOptionInstruments(chain.id, expirationDate, 'call'),
          this._fetchOptionInstruments(chain.id, expirationDate, 'put'),
        ]);

        transaction(tx => {
          this._selectedExpirationDate$.set(expirationDate, tx);
          this._callOptionInstruments.set(callInstruments, tx);
          this._putOptionInstruments.set(putInstruments, tx);
          this._updateMarketData();
        });
      }),
    );
  }

  // Helper method to create market data items
  private _createMarketDataItems(
    reader: IReader,
    instrumentsObs: typeof this._callOptionInstruments,
    marketDataObs: typeof this._callOptionsMarketData,
    optionType: OptionType,
  ): IMarketDataItem[] {
    const instruments = instrumentsObs.read(reader);
    const marketData = marketDataObs.read(reader);

    if (!instruments || !marketData) {
      return [];
    }

    return instruments
      .reduce<IMarketDataItem[]>((acc, instrument) => {
        const data = marketData.find(data => data.instrument_id === instrument.id);
        if (!data) {
          return acc;
        }
        acc.push({
          id: instrument.id,
          strikePrice: instrument.strike_price,
          askPrice: data.ask_price,
          delta: data.delta,
          impliedVolatility: data.implied_volatility,
          optionType, // Add option type to distinguish between CALL and PUT
        });
        return acc;
      }, [])
      .sort((a, b) => parseFloat(b.strikePrice) - parseFloat(a.strikePrice));
  }

  // Updated binding: use an arrow function property
  public setOptionType = (optionType: OptionType): void => {
    this._optionType$.set(optionType, undefined);
  };

  // Updated binding: use an arrow function property
  public setSelectedExpirationDate = (expirationDate: string): void => {
    const availableDates = this.expirationDates.get();
    if (
      availableDates &&
      Array.isArray(availableDates) &&
      availableDates.includes(expirationDate)
    ) {
      this._selectedExpirationDate$.set(expirationDate, undefined);
    } else {
      console.warn(`Invalid expiration date: ${expirationDate}. Available dates:`, availableDates);
    }
  };

  // Find closest option by delta for a specific option type
  public findClosestOptionByDelta = (
    contractType: OptionType,
    deltaTarget: number,
  ): IMarketDataItem | undefined => {
    const marketData =
      contractType === OptionType.CALL ? this.callMarketData$.get() : this.putMarketData$.get();

    if (!marketData || marketData.length === 0) {
      return undefined;
    }

    // Adjust target for PUTs (expecting negative delta)
    const effectiveTarget =
      contractType === OptionType.PUT ? -Math.abs(deltaTarget) : Math.abs(deltaTarget);

    // Find the item with the minimum absolute difference in delta
    let closestItem: IMarketDataItem | undefined = undefined;
    let minDiff = Infinity;

    for (const item of marketData) {
      const itemDelta = parseFloat(item.delta);
      if (isNaN(itemDelta)) continue; // Skip if delta is not a valid number

      const diff = Math.abs(itemDelta - effectiveTarget);
      if (diff < minDiff) {
        minDiff = diff;
        closestItem = item;
      }
    }

    return closestItem;
  };

  private async _fetchChain(): Promise<IOptionsChain | undefined> {
    try {
      const response = await this.requestService.fetchOptionsChains(this.symbol);
      const [firstChain] = response.results;
      return firstChain || undefined;
    } catch (error) {
      console.error('Error fetching chain for', this.symbol, error);
      return undefined;
    }
  }

  private async _fetchActiveInstrument(): Promise<IActiveInstruments | undefined> {
    try {
      const response = await this.requestService.fetchActiveInstruments(this.symbol);
      return response.results[0];
    } catch (error) {
      console.error('Error fetching active instrument for', this.symbol, error);
      return undefined;
    }
  }

  private async _fetchMarketDataQuote(
    instrumentId: string,
  ): Promise<IMarketDataQuotesResult | undefined> {
    try {
      const response = await this.requestService.fetchMarketDataQuotes(instrumentId);
      return response.results[0];
    } catch (error) {
      console.error('Error fetching market data quote for instrument:', instrumentId, error);
      return undefined;
    }
  }

  private async _fetchOptionInstruments(
    chainId: string,
    expirationDate: string,
    optionType: 'call' | 'put',
  ): Promise<IOptionsInstrument[]> {
    try {
      return await this.requestService.fetchAllOptionsInstruments(
        chainId,
        expirationDate,
        optionType,
      );
    } catch (error) {
      console.error('Error fetching option instruments for chain:', chainId, error);
      return [];
    }
  }

  private async init(): Promise<void> {
    const [chain, activeInstrument] = await Promise.all([
      this._fetchChain(),
      this._fetchActiveInstrument(),
    ]);

    transaction(tx => {
      this._chain$.set(chain, tx);
      this._activeInstrument$.set(activeInstrument, tx);

      if (chain && chain['expiration_dates']) {
        this._selectedExpirationDate$.set(chain['expiration_dates'][0], tx);
      } else {
        this._chain$.set(undefined, tx);
      }
    });
  }

  private async _updateMarketData(): Promise<void> {
    const activeInstrument = this._activeInstrument$.get();
    if (!activeInstrument) {
      return;
    }

    const quote = await this._fetchMarketDataQuote(activeInstrument.id);
    if (!quote?.last_trade_price) {
      return;
    }

    // Update market data for both CALL and PUT instruments
    await Promise.all([
      this._updateTypeMarketData(
        this._callOptionInstruments.get(),
        quote,
        this._callOptionsMarketData,
      ),
      this._updateTypeMarketData(
        this._putOptionInstruments.get(),
        quote,
        this._putOptionsMarketData,
      ),
    ]);

    // Update the price quote
    this._marketDataQuote.set(quote, undefined);
  }

  private async _updateTypeMarketData(
    instruments: IOptionsInstrument[] | undefined,
    quote: IMarketDataQuotesResult,
    marketDataObservable: typeof this._callOptionsMarketData,
  ): Promise<void> {
    if (!instruments || instruments.length === 0) {
      return;
    }

    // Sort instruments by strike price
    const sortedInstruments = [...instruments].sort(
      (a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price),
    );

    // Find the index of the closest strike price to the current price
    const currentPrice = quote.last_trade_price;
    const closestIndex = sortedInstruments.findIndex(
      instr => (instr.strike_price || 0) >= currentPrice,
    );

    // Get 20 strikes above and below
    const startIndex = Math.max(0, closestIndex - 20);
    const endIndex = Math.min(sortedInstruments.length, closestIndex + 20);
    const filteredInstruments = sortedInstruments.slice(startIndex, endIndex);

    // Get unique instrument IDs from filtered instruments
    const instrumentIds = Array.from(new Set(filteredInstruments.map(instr => instr.id)));

    // Create batches of 40 IDs
    const batches: string[][] = [];
    for (let i = 0; i < instrumentIds.length; i += 40) {
      batches.push(instrumentIds.slice(i, i + 40));
    }

    // Fetch market data for all batches
    const aggregatedMarketData: IOptionsMarketData[] = [];
    for (const batch of batches) {
      try {
        const response = await this.requestService.fetchOptionsMarketData(batch);
        if (response?.results) {
          const validResults = response.results.filter(
            (result): result is IOptionsMarketData => result !== null && result !== undefined,
          );
          aggregatedMarketData.push(...validResults);
        }
      } catch (error) {
        console.error('Error fetching options market data:', error);
      }
    }

    // Update the observable with the aggregated market data
    marketDataObservable.set(aggregatedMarketData, undefined);
  }

  public startChainWatcher(): void {
    this.timerService.createTimer(this._chainTimerId, this._refreshInterval);
    this.timerService.startTimer(this._chainTimerId);
    this._register(
      autorun(reader => {
        this.timerService.getTick(this._chainTimerId).read(reader);
        this._updateMarketData();
      }),
    );
  }

  public override dispose(): void {
    this.timerService.stopTimer(this._chainTimerId);
    super.dispose();
  }
}
