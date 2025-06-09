import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IObservable, ITransaction, observableValue, transaction } from 'vs/base/common/observable';
import { IPricebookDataService, PricebookDataService } from './pricebookData.service';

export interface IPricebooksService {
  readonly activePricebooks$: IObservable<Map<string, IPricebookDataService>>;
  getPricebook(symbol: string): IPricebookDataService;
  removePricebook(symbol: string): void;
  start(): Promise<void>;
  readonly selectedSymbols$: IObservable<string[]>;
  setSymbols(symbols: string[]): void;
}

/**
 * Manages a collection of pricebook services.
 *
 * Pricebooks are created lazily when requested via `getPricebook`.
 * Updating the list of “active” pricebooks and the selected symbols is done within transactions.
 */
export class PricebooksService extends Disposable implements IPricebooksService {
  // Observable tracking active pricebooks by symbol.
  private readonly _activePricebooks$ = observableValue<Map<string, IPricebookDataService>>(
    'activePricebooks',
    new Map(),
  );
  public readonly activePricebooks$ = this._activePricebooks$;

  // Cache to hold the individual pricebook services.
  private readonly pricebookCache = new Map<string, IPricebookDataService>();

  // Observable tracking the list of selected symbols.
  private readonly _selectedSymbols$ = observableValue<string[]>('selectedSymbols', []);
  public readonly selectedSymbols$ = this._selectedSymbols$;

  constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
    super();
  }

  /**
   * Helper to update the active pricebooks observable.
   * @param tx - Optional transaction context.
   */
  private updateActivePricebooks(tx?: ITransaction): void {
    this._activePricebooks$.set(new Map(this.pricebookCache), tx);
  }

  /**
   * Retrieves (or lazily creates) the pricebook service for the given symbol.
   * @param symbol The symbol for which the pricebook is required.
   */
  public getPricebook(symbol: string): IPricebookDataService {
    let pricebook = this.pricebookCache.get(symbol);

    if (!pricebook) {
      // Create a new pricebook instance using the provided symbol
      pricebook = this.instantiationService.createInstance(PricebookDataService, symbol, {});
      void pricebook.start();
      this.pricebookCache.set(symbol, pricebook);
    }

    return pricebook;
  }

  /**
   * Removes and disposes of the pricebook service associated with the symbol.
   * @param symbol The symbol to remove.
   */
  public removePricebook(symbol: string): void {
    const pricebook = this.pricebookCache.get(symbol);
    if (pricebook) {
      pricebook.dispose();
      this.pricebookCache.delete(symbol);
      // Update outside a transaction; depending on your tracing needs, you might wrap this in one.
      this._activePricebooks$.set(new Map(this.pricebookCache), undefined);
    }
  }

  /**
   * Starts the service. (No-op since pricebooks are created lazily.)
   */
  public async start(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Updates the list of selected symbols.
   *
   * It removes pricebooks for symbols that are no longer selected and creates pricebooks
   * for new symbols.
   * @param symbols The new list of symbols.
   */
  public setSymbols(symbols: string[]): void {
    transaction(
      tx => {
        const currentSymbols = this._selectedSymbols$.get();

        // Remove pricebooks that are no longer selected.
        for (const symbol of currentSymbols) {
          if (!symbols.includes(symbol)) {
            this.removePricebook(symbol);
          }
        }

        // Create pricebooks for newly selected symbols.
        for (const symbol of symbols) {
          if (!currentSymbols.includes(symbol)) {
            this.getPricebook(symbol);
          }
        }

        // Update the observable tracking selected symbols.
        this._selectedSymbols$.set(symbols, tx);
      },
      () => `Setting pricebook symbols: ${symbols.join(', ')}`,
    );
  }

  override dispose(): void {
    // Dispose all pricebook services.
    for (const pricebook of this.pricebookCache.values()) {
      pricebook.dispose();
    }
    this.pricebookCache.clear();
    this._activePricebooks$.set(new Map(), undefined);
    super.dispose();
  }
}
