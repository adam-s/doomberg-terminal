import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { derived, IObservable, observableValue } from 'vs/base/common/observable';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { mapObservableArrayCached } from 'vs/base/common/observableInternal/utils';
import { OptionDataService } from './optionData.service';
import { waitForState } from 'vs/base/common/observableInternal/promise';

export const IOptionsChainsService = createDecorator<OptionsChainsService>('optionsChainsService');

export class OptionsChainsService extends Disposable {
  private readonly _selectedSymbols$ = observableValue<string[]>('selectedSymbols', []);

  private readonly registry = new Map<string, { refCount: number; chain: OptionDataService }>();

  public readonly selectedSymbols$: IObservable<string[]> = this._selectedSymbols$;

  /**
   * Observable array of OptionDataService instances that automatically manages lifecycle and caching.
   *
   * @description
   * This observable uses mapObservableArrayCached to efficiently manage OptionDataService instances:
   *
   * 1. Creation: Creates a new OptionDataService instance for each symbol in selectedSymbols$
   * 2. Caching: Reuses existing OptionDataService instances when symbols haven't changed
   * 3. Disposal: Automatically disposes old OptionDataService instances when removed from selectedSymbols$
   *
   * Each OptionDataService instance is initialized with default configuration for:
   * - Instrument count
   * - Option type
   * - Update interval
   * - Maximum selected dates
   */
  public readonly chains$ = mapObservableArrayCached(
    this,
    this.selectedSymbols$,
    (symbol: string, store) => this._subscribeChain(symbol, store),
    (symbol: string) => symbol,
  );

  public readonly chainSymbols$ = derived(this, reader =>
    this.chains$.read(reader).map(chain => chain.symbol),
  );

  constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
    super();
  }

  public setSymbols(symbols: string[]): void {
    this._selectedSymbols$.set(symbols, undefined);
  }

  /**
   * Gets or creates an OptionDataService for the given symbol.
   * Ensures the symbol is tracked and returns the corresponding service when available.
   *
   * @param symbol The symbol to get the service for
   * @returns A promise that resolves to the OptionDataService for the symbol
   */
  public async getService(symbol: string): Promise<OptionDataService> {
    // Add the symbol if not already present
    const currentSymbols = this._selectedSymbols$.get();
    if (!currentSymbols.includes(symbol)) {
      this.setSymbols([...currentSymbols, symbol]);
    }

    // Use waitForState to reactively wait for the service to be available
    return waitForState(
      this.chains$.map(chains => chains.find(chain => chain.symbol === symbol)),
      (service): service is OptionDataService => service !== undefined,
    );
  }

  private _subscribeChain(symbol: string, store: DisposableStore): OptionDataService {
    let registryEntry = this.registry.get(symbol);
    if (registryEntry) {
      registryEntry.refCount += 1;
    } else {
      const chain = this.instantiationService.createInstance(OptionDataService, symbol, {});
      registryEntry = { refCount: 1, chain };
      this.registry.set(symbol, registryEntry);
      store.add({
        dispose: () => this._unsubscribeChain(symbol),
      });
      // Start the service when created
      void chain.start();
    }
    return registryEntry.chain;
  }

  private _unsubscribeChain(symbol: string): void {
    const registryEntry = this.registry.get(symbol);
    if (!registryEntry) return;

    registryEntry.refCount -= 1;
    if (registryEntry.refCount <= 0) {
      registryEntry.chain.dispose();
      this.registry.delete(symbol);
    }
  }
}
