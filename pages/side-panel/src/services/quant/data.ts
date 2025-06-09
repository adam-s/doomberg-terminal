import { Disposable } from 'vs/base/common/lifecycle';
import { IDataService } from '../data.service';
import { OptionDataService } from '@src/services/chains/optionData.service';
import {
  ExtrinsicValueFlowsData,
  IExtrinsicValueFlowsData,
} from '../extrinsicValue/extrinsicValueFlowsData.service';
import { autorun, IObservable, derived } from 'vs/base/common/observable';
import { MOVING_AVERAGE_OPTIONS, MovingAveragePeriod } from './settings';

const debug = false;

/**
 * Represents the processed extrinsic value indicator data for a specific symbol
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

export interface OptionQuote {
  symbol: string;
  ask_price: string;
  bid_price: string;
  instrument_id: string;
  instrument: string;
  ask_size: string;
  bid_size: string;
  open_interest: string;
}

/**
 * Interface for accessing options data, extrinsic flows, and indicators
 */
export interface IData {
  // Chain data access
  getOptionChains(): Map<string, OptionDataService>;
  getOptionChain(symbol: string): OptionDataService | undefined;

  // Extrinsic flows data access
  getFlow(symbol: string, period: MovingAveragePeriod): IExtrinsicValueFlowsData | undefined;

  // Watched symbols
  readonly watchedSymbols: readonly string[];

  // Indicator data access
  getIndicatorData$(
    symbol: string,
    period: MovingAveragePeriod,
  ): IObservable<ExtrinsicIndicatorData | undefined>;

  getOptionQuote(instrumentId: string): OptionQuote | undefined;
}

export class Data extends Disposable implements IData {
  // Fixed list of watched symbols
  public readonly watchedSymbols: readonly string[];

  // Internal map to store option services by symbol - this will persist through the lifetime of the class
  private readonly _optionChainsMap = new Map<string, OptionDataService>();

  // Nested map to store flows by symbol and then by MA period
  private readonly _flowsBySymbol = new Map<
    string,
    Map<MovingAveragePeriod, IExtrinsicValueFlowsData>
  >();

  private _optionQuotes = new Map<string, OptionQuote>();

  constructor(
    symbols: string[] = ['QQQ', 'SPY'],
    @IDataService private readonly _dataService: IDataService,
  ) {
    super();
    this._optionChainsMap.get('QQQ')?.start();

    // Store symbols as a readonly property
    this.watchedSymbols = [...symbols];
    // Initialize data services with these symbols
    this._dataService.optionsChainsService.setSymbols(symbols);

    // Initialize mock quote data
    this._initializeDefaultQuotes();

    // Set up tracking of option data services immediately and keep them alive
    this._register(
      autorun(reader => {
        const optionDataServices = this._dataService.optionsChainsService.chains$.read(reader);
        // Track all chains and initialize flows for them
        optionDataServices.forEach(optionDataService => {
          const symbol = optionDataService.symbol;

          // Store the option chain service persistently
          this._optionChainsMap.set(symbol, optionDataService);

          // Initialize flows for this symbol with each MA period if not already done
          if (!this._flowsBySymbol.has(symbol)) {
            this._initializeFlowsForSymbol(symbol, optionDataService);
          }
        });
      }),
    );

    // Initialize with some mock data
    this._optionQuotes.set('QQQ', {
      symbol: 'QQQ',
      ask_price: '100.00',
      bid_price: '99.00',
      instrument_id: 'QQQ-INSTRUMENT-ID',
      instrument: 'QQQ-INSTRUMENT',
      ask_size: '10',
      bid_size: '10',
      open_interest: '1000',
    });
    // Add more mock data as needed
  }

  /**
   * Debug log helper that only logs when debug is enabled
   * @param message The message to log
   */
  private debugLog(message: string): void {
    if (debug) {
      console.log(`[Data] ${message}`);
    }
  }

  /**
   * Initialize extrinsic value flows for a symbol with all MA periods
   */
  private _initializeFlowsForSymbol(symbol: string, optionDataService: OptionDataService): void {
    // Create a map for this symbol if it doesn't exist
    if (!this._flowsBySymbol.has(symbol)) {
      this._flowsBySymbol.set(symbol, new Map<MovingAveragePeriod, IExtrinsicValueFlowsData>());
    }

    const symbolFlowsMap = this._flowsBySymbol.get(symbol)!;

    // Initialize flow data for each MA period
    for (const period of MOVING_AVERAGE_OPTIONS) {
      if (!symbolFlowsMap.has(period)) {
        // Configure with the specific MA period
        const config = {
          movingAveragePeriod: period,
        };

        // Create and start the flows data service
        const flowsData = new ExtrinsicValueFlowsData(optionDataService, config);
        symbolFlowsMap.set(period, flowsData);
        flowsData
          .start()
          .catch(error =>
            console.error(`Failed to start flows for ${symbol} with period ${period}:`, error),
          );
      }
    }

    this.debugLog(`Initialized flows for symbol: ${symbol}`);
  }

  /**
   * Gets the map of all option chains
   * Returns the persistently maintained map of option chains
   */
  public getOptionChains(): Map<string, OptionDataService> {
    // Return the maintained map directly - no clearing or rebuilding needed
    return this._optionChainsMap;
  }

  /**
   * Gets a specific option chain by symbol
   */
  public getOptionChain(symbol: string): OptionDataService | undefined {
    return this._optionChainsMap.get(symbol);
  }

  /**
   * Gets extrinsic value flow data for a specific symbol and MA period
   * @param symbol The stock symbol
   * @param period The moving average period from MOVING_AVERAGE_OPTIONS
   * @returns The flow data service or undefined if not found
   */
  public getFlow(
    symbol: string,
    period: MovingAveragePeriod,
  ): IExtrinsicValueFlowsData | undefined {
    const symbolFlows = this._flowsBySymbol.get(symbol);
    if (!symbolFlows) return undefined;

    return symbolFlows.get(period);
  }

  /**
   * Gets an observable of indicator data for a specific symbol and MA period
   * @param symbol The stock symbol
   * @param period The moving average period
   * @param expirationIndex The index of expiration date to use (defaults to 0 - nearest expiration)
   */
  public getIndicatorData$(
    symbol: string,
    period: MovingAveragePeriod,
    expirationIndex = 0,
  ): IObservable<ExtrinsicIndicatorData | undefined> {
    const flows = this.getFlow(symbol, period);
    if (!flows) {
      return derived(() => undefined);
    }

    return derived(reader => {
      const lastUpdateTime = flows.lastUpdateTime$.read(reader);
      const currentPrice = flows.getCurrentPrice();
      const historicalFlowTotals = flows.historicalFlowTotals$.read(reader);
      const intermediateData = flows.intermediateOptionsFlowData$.read(reader);

      if (!historicalFlowTotals || !intermediateData) return undefined;

      const expirationDates = Object.keys(historicalFlowTotals).sort();
      if (expirationDates.length <= expirationIndex) return undefined;

      const targetExpiration = expirationDates[expirationIndex];
      const flowData = historicalFlowTotals[targetExpiration];

      // Calculate latest flow values
      const lastCallFlow = flowData.call[flowData.call.length - 1] || 0;
      const lastPutFlow = flowData.put[flowData.put.length - 1] || 0;
      const lastCumulative = flowData.cumulative[flowData.cumulative.length - 1] || 0;

      return {
        symbol,
        callFlow: lastCallFlow,
        putFlow: lastPutFlow,
        timestamp: lastUpdateTime,
        price: currentPrice,
        cumulativeFlow: lastCumulative,
        cumulativeFlow5: flowData.cumulative5?.[flowData.cumulative5.length - 1],
        cumulativeFlow8: flowData.cumulative8?.[flowData.cumulative8.length - 1],
        cumulativeFlow10: flowData.cumulative10?.[flowData.cumulative10.length - 1],
        cumulativeFlow20: flowData.cumulative20?.[flowData.cumulative20.length - 1],
        cumulativeFlow30: flowData.cumulative30?.[flowData.cumulative30.length - 1],
        cumulativeFlow40: flowData.cumulative40?.[flowData.cumulative40.length - 1],
        cumulativeFlow50: flowData.cumulative50?.[flowData.cumulative50.length - 1],
      };
    });
  }

  /**
   * Gets an option quote by instrumentId or symbol
   * @param instrumentIdOrSymbol The instrument ID or symbol to look up
   * @returns The option quote or undefined if not found
   */
  public getOptionQuote(instrumentIdOrSymbol: string): OptionQuote | undefined {
    // First try direct lookup by the provided ID
    let quote = this._optionQuotes.get(instrumentIdOrSymbol);

    // If not found and appears to be an instrument ID (contains dash), try extracting symbol
    if (!quote && instrumentIdOrSymbol.includes('-')) {
      const potentialSymbol = instrumentIdOrSymbol.split('-')[0];
      quote = this._optionQuotes.get(potentialSymbol);

      if (quote) {
        this.debugLog(
          `Found quote using extracted symbol ${potentialSymbol} from ${instrumentIdOrSymbol}`,
        );
      }
    }

    // If we found a quote but the instrument_id doesn't match, update our cache
    if (quote && quote.instrument_id !== instrumentIdOrSymbol) {
      // Create a copy with the correct instrument_id for future lookups
      const updatedQuote = { ...quote, instrument_id: instrumentIdOrSymbol };
      this._optionQuotes.set(instrumentIdOrSymbol, updatedQuote);
      this.debugLog(`Created cached quote for ${instrumentIdOrSymbol} based on ${quote.symbol}`);
      return updatedQuote;
    }

    return quote;
  }

  // Add more mock data for common testing cases
  private _initializeDefaultQuotes(): void {
    // Basic symbol quotes
    this._optionQuotes.set('QQQ', {
      symbol: 'QQQ',
      ask_price: '100.00',
      bid_price: '99.00',
      instrument_id: 'QQQ',
      instrument: 'QQQ-INSTRUMENT',
      ask_size: '10',
      bid_size: '10',
      open_interest: '1000',
    });

    this._optionQuotes.set('SPY', {
      symbol: 'SPY',
      ask_price: '450.00',
      bid_price: '449.00',
      instrument_id: 'SPY',
      instrument: 'SPY-INSTRUMENT',
      ask_size: '15',
      bid_size: '15',
      open_interest: '2000',
    });

    // Common instrument ID formats
    this._optionQuotes.set('QQQ-INSTRUMENT-ID', {
      symbol: 'QQQ',
      ask_price: '100.00',
      bid_price: '99.00',
      instrument_id: 'QQQ-INSTRUMENT-ID',
      instrument: 'QQQ-INSTRUMENT',
      ask_size: '10',
      bid_size: '10',
      open_interest: '1000',
    });
  }

  override dispose(): void {
    // Clean up all flow data services
    this._flowsBySymbol.forEach(symbolMap => {
      symbolMap.forEach(flowData => {
        flowData.dispose();
      });
    });

    super.dispose();
  }
}
