import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IObservable, derived, autorun, waitForState } from 'vs/base/common/observable';
import { OptionsChainsService } from '../chains/optionsChains.service';

import { MarketHours } from '../marketHours';
import { OptionDataService } from '../chains/optionData.service';
import { SentimentData } from './sentimentData';
import { SentimentDataConfig, SentimentDataPoint, SMADataPoint } from './sentimentUtils';

/**
 * Public interface for the sentiment data service
 */
export interface ISentimentService {
  readonly _serviceBrand: undefined;
  readonly selectedSymbols$: IObservable<string[]>;
  readonly sentimentDataArray$: IObservable<SentimentData[]>;
  readonly sentimentData$: IObservable<Map<string, SentimentData>>;

  getSentimentBySymbol(symbol: string): SentimentData | undefined;
  getSentimentBySymbolAsync(symbol: string): Promise<SentimentData>;
  subscribeToSymbols(symbols: string | string[]): () => void;
  dispose(): void;
}

/**
 * Service decorator for dependency injection
 */
export const ISentimentService = createDecorator<ISentimentService>('sentimentDataService');

/**
 * Implementation of the SentimentService
 */
export class SentimentService extends Disposable implements ISentimentService {
  declare readonly _serviceBrand: undefined;

  private marketCheckTimer: number | undefined;

  /**
   * Core instance storage for active symbols
   */
  private readonly _instanceMap = new Map<string, SentimentData>();

  /**
   * Live tracking of active trading symbols
   */
  public readonly selectedSymbols$ = derived(this, reader =>
    Array.from(this._optionsChainsService.chains$.read(reader)).map(service => service.symbol),
  );

  /**
   * Real-time array of sentiment calculations
   */
  public readonly sentimentDataArray$ = derived(this, reader =>
    Array.from(this._optionsChainsService.chains$.read(reader))
      .map(optionDataService => this._getInstance(optionDataService.symbol))
      .filter((data): data is SentimentData => data !== undefined),
  );

  /**
   * Symbol-keyed map of sentiment calculations
   */
  public readonly sentimentData$ = derived(
    this,
    reader => new Map(this.sentimentDataArray$.read(reader).map(data => [data.symbol, data])),
  );

  /**
   * Initializes the service with required dependencies
   */
  constructor(private readonly _optionsChainsService: OptionsChainsService) {
    super();
    this._registerAutoruns();
    this.startAllInstances(); // Start initially if market is open
  }

  /**
   * Sets up automatic instance management
   */
  private _registerAutoruns(): void {
    this._register(
      autorun(reader => {
        // First, read the current services/symbols to ensure we have the latest data
        const optionServices = Array.from(this._optionsChainsService.chains$.read(reader));
        const symbols = optionServices.map(service => service.symbol);

        // 1. Cleanup instances for symbols that are no longer active
        // Do this BEFORE attempting to start/stop instances to avoid race conditions
        this._cleanupUnusedInstances(symbols);

        // 2. Check market hours only after cleanup is complete
        const isMarketOpen = MarketHours.isMarketOpen();
        if (!isMarketOpen) {
          // Market is closed
          this.stopAllInstances();
          this.scheduleNextMarketOpen(); // Schedule to restart when market opens
          return; // Don't create new instances if market is closed
        } else {
          // Market is open - handle timer clearing
          if (this.marketCheckTimer !== undefined) {
            window.clearTimeout(this.marketCheckTimer);
            this.marketCheckTimer = undefined;
          }
        }

        // 3. Create new instances for active symbols
        // Only happens if market is open (due to return statement above)
        this._ensureInstancesExist(optionServices);
      }),
    );
  }

  private scheduleNextMarketOpen(): void {
    // Avoid scheduling if already scheduled
    if (this.marketCheckTimer !== undefined) return;

    const nextOpen = MarketHours.getNextMarketOpen();
    const delay = nextOpen.getTime() - Date.now();

    console.log(
      `SentimentService: Market closed. Scheduling check in ${delay / 1000 / 60} minutes.`,
    );
    this.marketCheckTimer = window.setTimeout(() => {
      this.marketCheckTimer = undefined; // Clear timer ID after execution
      console.log('SentimentService: Checking market status after scheduled delay.');
      this.startAllInstances(); // Attempt to start, which will re-evaluate market hours
    }, delay);
  }

  private stopAllInstances(): void {
    if (this._instanceMap.size === 0) return; // No instances to stop
    console.log('SentimentService: Market closed or service stopping. Stopping all instances.');
    for (const instance of this._instanceMap.values()) {
      instance.stop(); // Use the stop method on SentimentData
    }
    // Clear schedule if we are stopping explicitly
    if (this.marketCheckTimer !== undefined) {
      window.clearTimeout(this.marketCheckTimer);
      this.marketCheckTimer = undefined;
    }
  }

  private startAllInstances(): void {
    if (!MarketHours.isMarketOpen()) {
      console.log('SentimentService: Attempted to start instances, but market is closed.');
      this.scheduleNextMarketOpen();
      return;
    }

    if (this._instanceMap.size > 0) {
      console.log('SentimentService: Market open. Starting all instances.');
    }
    for (const instance of this._instanceMap.values()) {
      // Assuming SentimentData.start() handles its own logic based on OptionDataService
      void instance.start();
    }
  }

  /**
   * Removes instances for symbols no longer being tracked.
   */
  private _cleanupUnusedInstances(activeSymbols: string[]): void {
    for (const symbol of this._instanceMap.keys()) {
      if (!activeSymbols.includes(symbol)) {
        this._removeInstance(symbol);
      }
    }
  }

  /**
   * Creates instances for new symbols being tracked.
   */
  private _ensureInstancesExist(optionServices: OptionDataService[]): void {
    optionServices.forEach(service => {
      if (!this._instanceMap.has(service.symbol)) {
        this._createInstance(service);
      }
    });
  }

  /**
   * Creates and initializes a new sentiment data instance
   */
  private _createInstance(
    optionDataService: OptionDataService,
    config?: SentimentDataConfig,
  ): void {
    console.log(`SentimentService: Creating instance for ${optionDataService.symbol}`);
    const sentimentData = new SentimentData(optionDataService, config);
    // Start the instance only if the market is open
    if (MarketHours.isMarketOpen()) {
      void sentimentData.start();
    }
    this._instanceMap.set(optionDataService.symbol, sentimentData);
  }

  /**
   * Cleans up resources for a symbol being removed.
   */
  private _removeInstance(symbol: string): void {
    const instance = this._instanceMap.get(symbol);
    if (instance) {
      console.log(`SentimentService: Removing instance for ${symbol}`);
      instance.dispose();
      this._instanceMap.delete(symbol);
    }
  }

  /**
   * Retrieves cached instance for a symbol
   */
  private _getInstance(symbol: string): SentimentData | undefined {
    return this._instanceMap.get(symbol);
  }

  /**
   * Gets or creates a sentiment data instance with optional configuration
   */
  public async get(symbol: string, config?: SentimentDataConfig): Promise<SentimentData> {
    const existingInstance = this._instanceMap.get(symbol);
    if (existingInstance) {
      // If config is provided and differs from current, create new instance
      if (config && JSON.stringify(existingInstance.config) !== JSON.stringify(config)) {
        existingInstance.dispose();
        this._instanceMap.delete(symbol);
      } else {
        return existingInstance;
      }
    }

    // Get or create the options data service
    const optionsService = await this._optionsChainsService.getService(symbol);
    this._createInstance(optionsService, config);

    const newInstance = this._instanceMap.get(symbol);
    if (!newInstance) {
      throw new Error(`Failed to create sentiment instance for ${symbol}`);
    }

    return newInstance;
  }

  // Public API Methods

  /**
   * Synchronously retrieves sentiment calculations for a symbol
   */
  public getSentimentBySymbol(symbol: string): SentimentData | undefined {
    return this.sentimentData$.get().get(symbol);
  }

  /**
   * Asynchronously waits for and retrieves sentiment calculations
   */
  public async getSentimentBySymbolAsync(symbol: string): Promise<SentimentData> {
    return waitForState(
      this.sentimentData$.map(map => map.get(symbol)),
      (data): data is SentimentData => data !== undefined,
    );
  }

  /**
   * Retrieves sentiment data grouped by expiration date for a symbol
   * @param symbol The symbol to get sentiment data for
   * @returns Map of expiration dates to sentiment values, or undefined if not available
   */
  public getSentimentBySymbolAndExpiration(symbol: string): Map<string, number> | undefined {
    const sentimentData = this.getSentimentBySymbol(symbol);
    return sentimentData?.sentimentByExpiration$.get();
  }

  /**
   * Asynchronously waits for and retrieves sentiment data by expiration date
   * @param symbol The symbol to get sentiment data for
   * @returns Promise resolving to a map of expiration dates to sentiment values
   */
  public async getSentimentBySymbolAndExpirationAsync(
    symbol: string,
  ): Promise<Map<string, number>> {
    const sentimentData = await this.getSentimentBySymbolAsync(symbol);
    return sentimentData.sentimentByExpiration$.get();
  }

  /**
   * Retrieves sentiment history grouped by expiration date for a symbol
   * @param symbol The symbol to get sentiment history for
   * @returns Map of expiration dates to sentiment history arrays, or undefined if not available
   */
  public getSentimentHistoryBySymbolAndExpiration(
    symbol: string,
  ): Map<string, SentimentDataPoint[]> | undefined {
    const sentimentData = this.getSentimentBySymbol(symbol);
    return sentimentData?.sentimentHistoryByExpiration$.get();
  }

  /**
   * Retrieves SMA data grouped by expiration date for a symbol
   * @param symbol The symbol to get SMA data for
   * @returns Map of expiration dates to SMA values, or undefined if not available
   */
  public getSentimentSMABySymbolAndExpiration(symbol: string): Map<string, number> | undefined {
    const sentimentData = this.getSentimentBySymbol(symbol);
    return sentimentData?.sentimentSMA10ByExpiration$.get();
  }

  /**
   * Retrieves SMA history grouped by expiration date for a symbol
   * @param symbol The symbol to get SMA history for
   * @returns Map of expiration dates to SMA history arrays, or undefined if not available
   */
  public getSentimentSMAHistoryBySymbolAndExpiration(
    symbol: string,
  ): Map<string, SMADataPoint[]> | undefined {
    const sentimentData = this.getSentimentBySymbol(symbol);
    return sentimentData?.sentimentSMAHistoryByExpiration$.get();
  }

  /**
   * Subscribes to updates for one or more symbols
   * Returns cleanup function to unsubscribe
   * Handles duplicate subscriptions and cleanup
   */
  public subscribeToSymbols(symbol: string): () => void;
  public subscribeToSymbols(symbols: string[]): () => void;
  public subscribeToSymbols(symbolOrSymbols: string | string[]): () => void {
    const symbols = Array.isArray(symbolOrSymbols) ? symbolOrSymbols : [symbolOrSymbols];
    const currentSymbols = this.selectedSymbols$.get();
    const newSymbols = [...new Set([...currentSymbols, ...symbols])];

    // Update the symbols managed by OptionsChainsService
    this._optionsChainsService.setSymbols(newSymbols);

    // Return cleanup function
    return () => {
      const currentSymbols = this.selectedSymbols$.get();
      const remainingSymbols = currentSymbols.filter(s => !symbols.includes(s));
      this._optionsChainsService.setSymbols(remainingSymbols);
    };
  }

  /**
   * Cleans up all resources and subscriptions
   */
  public override dispose(): void {
    console.log('SentimentService: Disposing...');
    this.stopAllInstances(); // Ensure instances are stopped
    // Clear market check timer if active
    if (this.marketCheckTimer !== undefined) {
      window.clearTimeout(this.marketCheckTimer);
      this.marketCheckTimer = undefined;
    }
    // Dispose instances managed by this service
    Array.from(this._instanceMap.keys()).forEach(symbol => this._removeInstance(symbol));
    this._instanceMap.clear();
    super.dispose(); // Call base class dispose
  }
}
