import { Disposable } from 'vs/base/common/lifecycle';
import { IDataService } from '../data.service';
import { OptionDataService } from '@src/services/chains/optionData.service';

import { autorun } from 'vs/base/common/observable';

const debug = false;

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

  // Watched symbols
  readonly watchedSymbols: readonly string[];

  getOptionQuote(instrumentId: string): OptionQuote | undefined;
}

export class Data extends Disposable implements IData {
  // Fixed list of watched symbols
  public readonly watchedSymbols: readonly string[];

  // Internal map to store option services by symbol - this will persist through the lifetime of the class
  private readonly _optionChainsMap = new Map<string, OptionDataService>();

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

    // Set up tracking of option data services immediately and keep them alive
    this._register(
      autorun(reader => {
        const optionDataServices = this._dataService.optionsChainsService.chains$.read(reader);
        // Track all chains and initialize flows for them
        optionDataServices.forEach(optionDataService => {
          const symbol = optionDataService.symbol;

          // Store the option chain service persistently
          this._optionChainsMap.set(symbol, optionDataService);
        });
      }),
    );
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

  override dispose(): void {
    super.dispose();
  }
}
