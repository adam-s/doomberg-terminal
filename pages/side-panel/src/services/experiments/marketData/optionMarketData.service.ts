/* eslint-disable */
// @ts-nocheck
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OptionsChainsService } from '../chains/optionsChains.service';
import {
  autorun,
  derivedOpts,
  IObservable,
  IReader,
  observableValue,
  waitForState,
} from 'vs/base/common/observable';
import { IOptionsInstrument, IOptionsMarketData } from '@shared/services/request.types';
import { derivedHandleChanges } from 'vs/base/common/observableInternal/derived';
import { SerializedMarketDataStrategy } from './SerializedMarketDataStrategy';
import { IMarketDataStrategy } from './IMarketDataStrategy';
import { LiveMarketDataStrategy } from './LiveMarketDataStrategy';
import { ChainConfig } from '../chains/config';
import { ITimerService } from '@src/services/timer.service';

// Convert readonly array to regular array using spread operator
const SYMBOLS = [...ChainConfig.DEFAULT_SYMBOLS];
const DEFAULT_MAX_HISTORY = ChainConfig.MAX_MARKET_DATA_HISTORY;
const MARKET_DATA_FETCH_INTERVAL = ChainConfig.MARKET_DATA_FETCH_INTERVAL;

// const USE_MOCK_MARKET_DATA = process.env.NODE_ENV === 'development';
const USE_MOCK_MARKET_DATA = false;

export class OptionsMarketDataService extends Disposable {
  private readonly _optionsChainsService: OptionsChainsService;
  private readonly _maxHistory: number;
  private readonly _cachedMarketData: Map<string, IOptionsMarketData | null>[] = [];

  private readonly _fetchTimerId = 'options-market-data-fetch';
  private readonly _marketDataStrategy: IMarketDataStrategy;

  /**
   * Derived observable that computes the intersection of expiration dates across all chains.
   *
   * @description
   * This observable:
   * 1. Reads expiration dates from all option chains
   * 2. Finds common dates available across all symbols (QQQ, SPY, DIA)
   * 3. Returns empty array if any chain is not loaded or has no dates
   *
   * Key behaviors:
   * - Only returns dates that exist in ALL chains
   * - Updates automatically when any chain's expiration dates change
   * - Uses custom equality function to prevent unnecessary updates
   * - Used to synchronize date selection across chains
   *
   * @example
   * ```typescript
   * // Get current common dates
   * const commonDates = this._commonDates$.get();
   *
   * // React to changes in common dates
   * autorun(reader => {
   *   const dates = this._commonDates$.read(reader);
   *   console.log('Available in all chains:', dates);
   * });
   * ```
   */
  private readonly _commonDates$ = derivedOpts(
    {
      owner: this,
      equalsFn: (a: readonly string[], b: readonly string[]) =>
        a.length === b.length && a.every((val, idx) => val === b[idx]),
    },
    reader => {
      const chains = this._optionsChainsService.chains$.read(reader);
      if (chains.length !== SYMBOLS.length) {
        return [];
      }

      // Collect all expiration dates
      const expirationDates = chains.map(chain => chain.expirationDates$.read(reader));

      // If any chain has no dates, return empty
      if (expirationDates.some(dates => dates.length === 0)) {
        return [];
      }

      // Intersect all expiration dates
      const [first, ...rest] = expirationDates;
      return rest.reduce((acc, curr) => acc.filter(date => curr.includes(date)), first);
    },
  );

  public readonly commonDates$: IObservable<readonly string[]> = this._commonDates$;

  // Hold snapshots of market data over time
  private readonly _marketDataSeries$ = observableValue<
    readonly Map<string, IOptionsMarketData | null>[]
  >('marketDataSeries', []);

  public readonly marketDataSeries$: IObservable<
    readonly Map<string, IOptionsMarketData | null>[]
  > = this._marketDataSeries$;

  // Indicates when all chains have loaded their instruments
  private readonly _chainsLoaded$ = observableValue<boolean>('chainsLoaded', false);

  // Expose derived values from marketDataSeries

  /**
   * Derived observable that transforms chain data into a nested object structure for efficient access.
   *
   * @description
   * This observable organizes option chain data into a hierarchical structure:
   * symbol -> expiration date -> option type (call/put) -> instrument ID
   *
   * Key features:
   * 1. Only processes data when chains are fully loaded
   * 2. Uses change detection to minimize unnecessary updates
   * 3. Maintains reference equality when data hasn't changed
   *
   * Structure:
   * ```typescript
   * {
   *   "SPY": {
   *     "2024-01-19": {
   *       call: { [instrumentId: string]: IOptionsInstrument },
   *       put: { [instrumentId: string]: IOptionsInstrument }
   *     }
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Access all calls for SPY on a specific date
   * const spy = nestedChains$.get()?.['SPY']?.['2024-01-19']?.call;
   *
   * // React to changes
   * autorun(reader => {
   *   const chains = nestedChains$.read(reader);
   *   // Process updated chain structure
   * });
   * ```
   *
   * @note Only updates when _chainsLoaded$ changes or underlying chain data changes
   */
  public readonly nestedChains$ = derivedHandleChanges<
    Record<
      string,
      Record<
        string,
        { call: Record<string, IOptionsInstrument>; put: Record<string, IOptionsInstrument> }
      >
    >,
    { loadedChanged: boolean }
  >(
    {
      owner: this,
      debugName: 'nestedChains$',
      createEmptyChangeSummary: () => ({ loadedChanged: false }),
      handleChange: (context, summary) => {
        if (context.didChange(this._chainsLoaded$)) {
          summary.loadedChanged = true;
        }
        return summary.loadedChanged;
      },
    },
    reader => {
      if (!this._chainsLoaded$.read(reader)) {
        return {};
      }
      const chains = this._optionsChainsService.chains$.read(reader);
      const result: Record<
        string,
        Record<
          string,
          { call: Record<string, IOptionsInstrument>; put: Record<string, IOptionsInstrument> }
        >
      > = {};

      for (const chain of chains) {
        result[chain.symbol] = result[chain.symbol] || {};
        const chainInstruments = chain.instruments$.read(reader);
        // chainInstruments is assumed to be a Map<string, Map<'call' | 'put', IOptionsInstrument[]>>

        for (const [expirationDate, typeMap] of chainInstruments) {
          const callInstruments: Record<string, IOptionsInstrument> = {};
          for (const inst of typeMap.get('call') || []) {
            callInstruments[inst.id] = inst;
          }
          const putInstruments: Record<string, IOptionsInstrument> = {};
          for (const inst of typeMap.get('put') || []) {
            putInstruments[inst.id] = inst;
          }
          result[chain.symbol][expirationDate] = { call: callInstruments, put: putInstruments };
        }
      }
      return result;
    },
  );

  constructor(
    maxHistory: number = DEFAULT_MAX_HISTORY,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();
    this._maxHistory = maxHistory;

    // Instantiate and register the OptionsChainsService
    this._optionsChainsService = this._register(
      this.instantiationService.createInstance(OptionsChainsService),
    );

    // Initialize appropriate strategy
    this._marketDataStrategy = this._register(
      USE_MOCK_MARKET_DATA
        ? new SerializedMarketDataStrategy()
        : new LiveMarketDataStrategy(this._optionsChainsService),
    );

    this._initializeChains();
    this._registerAutoruns();
    this._registerDisposeCleanup();
  }

  // -- Public API
  public async start(): Promise<void> {}

  public clearCache(): void {
    this._cachedMarketData.length = 0;
    this._marketDataSeries$.set([], undefined);
  }

  public override dispose(): void {
    this._stopMarketDataFetching();
    this.clearCache();
    super.dispose();
  }

  // -- Private Setup Methods

  private _initializeChains(): void {
    this._optionsChainsService.setSymbols(SYMBOLS);
  }

  /**
   * Central place to register all autorun side-effects.
   */
  private _registerAutoruns(): void {
    this._register(autorun(reader => this._onCommonDatesUpdate(reader)));
    this._register(autorun(reader => this._onChainsLoaded(reader)));
  }

  /**
   * Cleanup logic on dispose.
   */
  private _registerDisposeCleanup(): void {
    this._register({
      dispose: () => {
        this._stopMarketDataFetching();
      },
    });
  }

  /**
   * Sets the first two common dates on all option chains when available.
   */
  private _onCommonDatesUpdate(reader: IReader): void {
    const commonDates = this._commonDates$.read(reader);
    const chains = this._optionsChainsService.chains$.read(reader);
    if (commonDates.length > 0 && chains.length === SYMBOLS.length) {
      const selectedDates = commonDates.slice(0, 2);
      chains.forEach(chain => chain.setSelectedDates(selectedDates));
    }
  }

  /**
   * Waits for all chains to have instruments data, then signals chains are loaded
   * and triggers market data fetching.
   */
  private async _onChainsLoaded(reader: IReader): Promise<void> {
    const chains = this._optionsChainsService.chains$.read(reader);

    // If chains haven't all been initialized yet, return early.
    if (chains.length !== SYMBOLS.length) {
      return;
    }

    // Wait for each chain to have instruments data
    await Promise.all(chains.map(chain => waitForState(chain.instruments$, data => data.size > 0)));

    // Mark as loaded and start fetching
    this._chainsLoaded$.set(true, undefined);
    this._startMarketDataFetching();
  }

  // -- Private Market Data Fetching

  /**
   * Triggers an immediate fetch and schedules recurring fetches.
   */
  private _startMarketDataFetching(): void {
    this._stopMarketDataFetching(); // ensure only one interval is active
    void this._fetchMarketData(); // initial fetch

    this._register(
      this.timerService.subscribeToTimer(
        this._fetchTimerId,
        MARKET_DATA_FETCH_INTERVAL,
        () => void this._fetchMarketData(),
      ),
    );
  }

  private _stopMarketDataFetching(): void {
    this.timerService.stopTimer(this._fetchTimerId);
  }

  /**
   * Fetches market data from each chain and stores a consolidated snapshot.
   */
  private async _fetchMarketData(): Promise<void> {
    const currentSnapshot = await this._marketDataStrategy.fetchNextSnapshot();

    if (currentSnapshot.size > 0) {
      const updatedData = [...this._cachedMarketData, currentSnapshot];
      while (updatedData.length > this._maxHistory) {
        updatedData.shift();
      }

      this._cachedMarketData.splice(0, this._cachedMarketData.length, ...updatedData);
      this._marketDataSeries$.set(updatedData, undefined);
    }
  }
}
