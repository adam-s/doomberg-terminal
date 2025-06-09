import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { autorun, derived, IObservable, observableValue } from 'vs/base/common/observable';
import {
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
} from '@shared/services/request.types';
import { Chain } from './chain';
import { registerDevDataAutorun } from './developmentServer.service';
import { MockRequestService } from './mockRequestService';
import { IRequestService } from '@shared/services/request.service';

const SAVE_DATA = false;
const USE_MOCK_DATA = false;

const DEFAULT_CONFIG: Required<OptionsDataServiceConfig> = {
  updateInterval: 10000,
  instrumentCount: 40,
  optionType: 'both',
  maxSelectedDates: 2,
};

export interface OptionsData {
  marketData: Map<string, IOptionsMarketData>;
  chainData: IOptionsChain | undefined;
  lastTradePrice: number | undefined;
  instruments: Record<string, IOptionsInstrument>;
  timestamp?: string;
}

export interface IOptionDataService extends Disposable {
  readonly symbol: string;
  readonly optionsData$: IObservable<OptionsData | undefined>;
  readonly chains$: IObservable<Map<string, IOptionsMarketData>>;
  start(): Promise<void>;
  stop(): void; // Add this method
}

export interface OptionsDataServiceConfig {
  instrumentCount?: number;
  optionType?: 'both' | 'call' | 'put';
  updateInterval?: number;
  maxSelectedDates?: number;
}

export class OptionDataService extends Disposable implements IOptionDataService {
  private readonly config: Required<OptionsDataServiceConfig>;

  // Private observables
  private readonly _chain$ = observableValue<Chain | undefined>('chain', undefined);

  // Public observables
  public readonly chain$ = this._chain$;
  public readonly expirationDates$ = derived(reader => {
    const chain = this._chain$.get();
    return chain?.expirationDates$.read(reader) ?? [];
  });

  // Add derived observable for market data
  public readonly marketData$ = derived(reader => {
    const chain = this._chain$.get();
    return chain?.marketData$.read(reader) ?? new Map<string, IOptionsMarketData>();
  });

  // Add the missing chains$ observable
  public readonly chains$ = this.marketData$;

  // Public derived observable for options data
  public readonly optionsData$ = derived(reader => {
    const marketData = this.marketData$.read(reader);
    if (marketData.size === 0) {
      return undefined;
    }
    const chain = this.chain$.get();
    return {
      marketData,
      chainData: chain?.chain$.get(),
      lastTradePrice: chain?.lastTradePrice$.get(),
      instruments: chain?.allInstruments$.get() ?? {},
    } satisfies OptionsData;
  });

  private updateTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly symbol: string,
    userConfig: Partial<OptionsDataServiceConfig> = {},
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...userConfig };

    this._registerChain();
    this._registerAutoruns();
    if (SAVE_DATA) {
      this._register(registerDevDataAutorun(this.optionsData$, this.symbol));
    }
  }

  private _registerChain(): void {
    let chain: Chain;
    if (USE_MOCK_DATA) {
      const requestService = this.instantiationService.invokeFunction(accessor =>
        accessor.get(IRequestService),
      );
      const mockRequestService = new MockRequestService(
        requestService,
      ) as unknown as IRequestService;
      chain = this._register(new Chain(this.symbol, mockRequestService));
    } else {
      chain = this._register(this.instantiationService.createInstance(Chain, this.symbol));
    }

    const existingChain = this._chain$.get();
    if (!existingChain || existingChain !== chain) {
      // Initialize chain settings using configuration
      chain.setInstrumentFilter({ type: 'count', value: this.config.instrumentCount });
      chain.setOptionType(this.config.optionType);
      chain.setRefreshInterval(this.config.updateInterval);

      this._chain$.set(chain, undefined);
    }
  }

  private _registerAutoruns(): void {
    // Update selected dates when chain changes
    this._register(
      autorun(reader => {
        const chain = this._chain$.get();
        if (chain) {
          const dates = chain.expirationDates$.read(reader);
          if (dates.length > 0) {
            const selectedDates = dates.slice(0, this.config.maxSelectedDates);
            chain.setSelectedDates(selectedDates);
          }
        }
      }),
    );
  }

  // Public API
  public async start(): Promise<void> {
    const chain = this._chain$.get();
    if (chain) {
      chain.startMarketDataUpdates(); // Start fetching market data
    }
  }

  public stop(): void {
    // Stop any active data fetching or subscriptions
    if (this.updateTimer) {
      window.clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  public setSelectedDate(date: string): void {
    const chain = this._chain$.get();
    if (chain) {
      chain.setSelectedDates([date]);
    }
  }

  /**
   * Retrieves instruments for a specific expiration date
   */
  public getInstrumentsByDate(date: string): Map<'call' | 'put', IOptionsInstrument[]> | undefined {
    const chain = this._chain$.get();
    if (!chain) {
      return undefined;
    }
    return chain.getInstrumentsByDate(date);
  }

  /**
   * Retrieves instruments for a specific date and option type
   */
  public getInstrumentsByDateAndType(
    date: string,
    type: 'call' | 'put',
  ): IOptionsInstrument[] | undefined {
    const chain = this._chain$.get();
    if (!chain) {
      return undefined;
    }
    return chain.getInstrumentsByDateAndType(date, type);
  }
}
