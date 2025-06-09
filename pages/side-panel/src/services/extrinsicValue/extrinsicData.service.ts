import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IObservable, derived, waitForState, autorun } from 'vs/base/common/observable';
import { ExtrinsicValueFlowsData } from './extrinsicValueFlowsData.service';
import { OptionDataService } from '../chains/optionData.service';
import { MarketHours } from '../marketHours';
import { OptionsChainsService } from '../chains/optionsChains.service';
import { IComputationService } from '@src/side-panel/worker/computation/computationService';

/**
 * Service responsible for managing and calculating extrinsic value data for option chains.
 * Provides observables and methods to track and analyze extrinsic value flows across multiple symbols.
 *
 * Key Features:
 * - Manages instances of ExtrinsicValueFlowsData per symbol
 * - Provides reactive data streams for extrinsic value calculations
 * - Handles lifecycle management of option data services
 * - Maintains symbol subscriptions and cleanup
 */

/**
 * Public interface for the extrinsic data service
 * Defines the contract for interacting with extrinsic value calculations
 */
export interface IExtrinsicDataService {
  readonly _serviceBrand: undefined;
  readonly selectedSymbols$: IObservable<string[]>;
  readonly extrinsicValueFlowsArray$: IObservable<ExtrinsicValueFlowsData[]>;
  readonly extrinsicValueFlowsData$: IObservable<Map<string, ExtrinsicValueFlowsData>>;

  getExtrinsicBySymbol(symbol: string): ExtrinsicValueFlowsData | undefined;
  getExtrinsicBySymbolAsync(symbol: string): Promise<ExtrinsicValueFlowsData>;
  subscribeToSymbols(symbol: string | string[]): () => void;
  dispose(): void;
}

/**
 * Service decorator for dependency injection
 */
export const IExtrinsicDataService = createDecorator<IExtrinsicDataService>('extrinsicDataService');

/**
 * Implementation of the ExtrinsicDataService
 * Manages extrinsic value calculations and data flow for options trading
 */
export class ExtrinsicDataService extends Disposable implements IExtrinsicDataService {
  declare readonly _serviceBrand: undefined;

  private marketCheckTimer: number | undefined;

  /**
   * Core instance storage for active symbols
   * Maps each symbol to its corresponding services and flow calculations
   * Handles caching and lifecycle management of instances
   */
  private readonly _instanceMap$ = new Map<
    string,
    { optionData: OptionDataService; flows: ExtrinsicValueFlowsData }
  >();

  /**
   * Live tracking of active trading symbols
   * Provides reactive updates when symbols are added or removed
   * Used for coordination with option chain data services
   */
  public readonly selectedSymbols$ = derived(this, reader =>
    Array.from(this._optionsChainsService.chains$.read(reader)).map(service => service.symbol),
  );

  /**
   * Real-time array of extrinsic value calculations
   * Updates when:
   * - New symbols are added
   * - Market data changes
   * - Option chains are updated
   * Each entry contains full analysis for one symbol
   */
  public readonly extrinsicValueFlowsArray$ = derived(this, reader =>
    Array.from(this._optionsChainsService.chains$.read(reader))
      .map(optionDataService => {
        const instance = this._getInstance(optionDataService.symbol);
        return instance?.flows;
      })
      .filter((flow): flow is ExtrinsicValueFlowsData => flow !== undefined),
  );

  /**
   * Symbol-keyed map of extrinsic calculations
   * Provides quick lookup of extrinsic data by symbol
   * Updates in sync with extrinsicValueFlowsArray$
   */
  public readonly extrinsicValueFlowsData$ = derived(
    this,
    reader =>
      new Map(
        this.extrinsicValueFlowsArray$
          .read(reader)
          .map(data => [data.optionDataService.symbol, data]),
      ),
  );

  /**
   * Initializes the service with data service dependency
   * Sets up auto-cleanup and instance management
   */
  constructor(
    private readonly _optionsChainsService: OptionsChainsService,
    @IComputationService private readonly _computationService: IComputationService, // Injected
  ) {
    super();
    this._registerAutoruns();
  }

  /**
   * Sets up automatic instance management
   * Handles cleanup of unused instances and creation of new ones
   * Runs when chain data or symbols change
   */
  private _registerAutoruns(): void {
    this._register(
      autorun(reader => {
        if (!MarketHours.isMarketOpen()) {
          this.stopAllInstances();
          this.scheduleNextMarketOpen();
          return;
        }

        const optionServices = Array.from(this._optionsChainsService.chains$.read(reader));
        const symbols = optionServices.map(service => service.symbol);
        this._cleanupUnusedInstances(symbols);
        this._ensureInstancesExist(optionServices);
      }),
    );
  }

  private scheduleNextMarketOpen(): void {
    const nextOpen = MarketHours.getNextMarketOpen();
    const delay = nextOpen.getTime() - Date.now();

    this.marketCheckTimer = window.setTimeout(() => {
      this.startAllInstances();
    }, delay);
  }

  private stopAllInstances(): void {
    for (const instance of this._instanceMap$.values()) {
      instance.flows.stop();
    }
  }

  private startAllInstances(): void {
    if (!MarketHours.isMarketOpen()) {
      this.scheduleNextMarketOpen();
      return;
    }

    for (const instance of this._instanceMap$.values()) {
      void instance.flows.start();
    }
  }

  /**
   * Removes instances for symbols no longer being tracked.
   * Prevents memory leaks and ensures proper cleanup.
   */
  private _cleanupUnusedInstances(activeSymbols: string[]): void {
    for (const symbol of this._instanceMap$.keys()) {
      if (!activeSymbols.includes(symbol)) {
        this._removeInstance(symbol);
      }
    }
  }

  /**
   * Creates instances for new symbols being tracked.
   * Ensures all active symbols have corresponding services.
   */
  private _ensureInstancesExist(optionServices: OptionDataService[]): void {
    optionServices.forEach(service => {
      if (!this._instanceMap$.has(service.symbol)) {
        this._createInstance(service);
      }
    });
  }

  /**
   * Creates and initializes a new extrinsic value flow instance
   * Sets up data flow calculations and caching
   */
  private _createInstance(optionDataService: OptionDataService): void {
    const extrinsicValueFlows = new ExtrinsicValueFlowsData(
      optionDataService,
      this._computationService, // Pass down the computation service
    );
    extrinsicValueFlows.start();

    this._instanceMap$.set(optionDataService.symbol, {
      optionData: optionDataService,
      flows: extrinsicValueFlows,
    });
  }

  /**
   * Cleans up resources for a symbol being removed.
   * Ensures proper disposal of services and memory cleanup.
   */
  private _removeInstance(symbol: string): void {
    const instance = this._instanceMap$.get(symbol);
    if (instance) {
      instance.flows.dispose();
      instance.optionData.dispose();
      this._instanceMap$.delete(symbol);
    }
  }

  /**
   * Retrieves cached instance for a symbol
   * Returns undefined if symbol isn't being tracked
   */
  private _getInstance(
    symbol: string,
  ): { optionData: OptionDataService; flows: ExtrinsicValueFlowsData } | undefined {
    return this._instanceMap$.get(symbol);
  }

  // Public API Methods

  /**
   * Synchronously retrieves extrinsic calculations for a symbol
   * Returns undefined if symbol isn't tracked or data isn't ready
   */
  public getExtrinsicBySymbol(symbol: string): ExtrinsicValueFlowsData | undefined {
    return this.extrinsicValueFlowsData$.get().get(symbol);
  }

  /**
   * Asynchronously waits for and retrieves extrinsic calculations
   * Resolves when data becomes available for the symbol
   */
  public async getExtrinsicBySymbolAsync(symbol: string): Promise<ExtrinsicValueFlowsData> {
    return waitForState(
      this.extrinsicValueFlowsData$.map(map => map.get(symbol)),
      (data): data is ExtrinsicValueFlowsData => data !== undefined,
    );
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

    this._optionsChainsService.setSymbols(newSymbols);

    return () => {
      const symbols = Array.isArray(symbolOrSymbols) ? symbolOrSymbols : [symbolOrSymbols];
      const currentSymbols = this.selectedSymbols$.get();
      const remainingSymbols = currentSymbols.filter(s => !symbols.includes(s));
      this._optionsChainsService.setSymbols(remainingSymbols);
    };
  }

  /**
   * Cleans up all resources and subscriptions
   * Called when service is being disposed
   */
  public override dispose(): void {
    if (this.marketCheckTimer !== undefined) {
      window.clearTimeout(this.marketCheckTimer);
      this.marketCheckTimer = undefined;
    }
    Array.from(this._instanceMap$.keys()).forEach(this._removeInstance.bind(this));
    this._instanceMap$.clear();
    super.dispose();
  }
}
