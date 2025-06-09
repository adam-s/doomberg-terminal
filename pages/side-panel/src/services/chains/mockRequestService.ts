import type {
  IOptionsChainsResponse,
  IOptionsInstrumentsResponse,
  IOptionsMarketDataResponse,
  IOptionsChain,
  IOptionsInstrument,
  IOptionsMarketData,
  IActiveInstrumentsResponse,
  IMarketDataQuotesResponse,
  IOptionsAggregatedPositionsResponse,
  IOptionsOrdersResponse,
} from '@shared/services/request.types';
import {
  IRequestService,
  RobinhoodHeaders,
  DEFAULT_ACCOUNT_NUMBER,
} from '@shared/services/request.service';
import { DeferredPromise } from 'vs/base/common/async';

// Mock data configuration
const MOCK_DATA_FOLDER = '22'; // Default folder to pull mock data from
const BASE_URL = 'http://localhost:3000/data/mock';

interface IMarketDataPayload {
  estTime: string;
  lastTradePrice: string;
}

class ObservableValue<T> {
  private observers: Array<(value: T) => void> = [];

  public subscribe(observer: (value: T) => void): void {
    this.observers.push(observer);
  }

  public unsubscribe(observer: (value: T) => void): void {
    this.observers = this.observers.filter(o => o !== observer);
  }

  public set(value: T): void {
    this.observers.forEach(observer => observer(value));
  }
}

export class MockRequestService {
  readonly _serviceBrand: undefined;
  private proxyHandler: ProxyHandler<MockRequestService>;
  private counter: number = 1;
  private lastTradePrice: string = '481';
  public symbol: string | undefined;
  private readonly _priceData$ = new ObservableValue<IMarketDataPayload>();
  public readonly marketData$ = this._priceData$;
  private marketDataBuffer: {
    marketData: Record<string, IOptionsMarketData>;
    lastTradePrice: string;
    timestamp: string;
  } | null = null;
  private bufferReady: boolean = false;

  constructor(private readonly baseRequestService: IRequestService) {
    this.proxyHandler = {
      get(target: MockRequestService, prop: string | symbol, receiver: unknown) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        return (...args: unknown[]) => {
          const method = Reflect.get(baseRequestService, prop);
          return method.apply(baseRequestService, args);
        };
      },
    };
    return new Proxy(this, this.proxyHandler);
  }

  get headers(): DeferredPromise<RobinhoodHeaders> {
    return this.baseRequestService.headers as unknown as DeferredPromise<RobinhoodHeaders>;
  }

  async start(): Promise<void> {
    return this.baseRequestService.start();
  }

  async fetchOptionsChains(symbol: string): Promise<IOptionsChainsResponse> {
    this.symbol = symbol;
    try {
      const response = await fetch(`${BASE_URL}/${this.symbol}/${MOCK_DATA_FOLDER}/chain`);
      if (!response.ok) {
        throw new Error(`Failed to fetch mock chain data: ${response.statusText}`);
      }
      const data = await response.json();

      // Validate chain structure
      const chain = data.chain as IOptionsChain;
      if (!chain || typeof chain !== 'object') {
        throw new Error('Invalid chain data structure');
      }

      return { results: [chain] } as IOptionsChainsResponse;
    } catch (error) {
      console.error('Error fetching mock chain data:', error);
      throw error;
    }
  }

  async fetchOptionsInstruments(): Promise<IOptionsInstrumentsResponse> {
    try {
      const response = await fetch(`${BASE_URL}/${this.symbol}/${MOCK_DATA_FOLDER}/instruments`);
      if (!response.ok) {
        throw new Error(`Failed to fetch mock instruments data: ${response.statusText}`);
      }
      const data = await response.json();

      // Validate instruments structure
      const instruments = data.instruments as Record<string, IOptionsInstrument>;
      if (!instruments || typeof instruments !== 'object') {
        throw new Error('Invalid instruments data structure');
      }

      return { results: Object.values(instruments) } as IOptionsInstrumentsResponse;
    } catch (error) {
      console.error('Error fetching mock instruments data:', error);
      throw error;
    }
  }

  async fetchOptionsMarketData(): Promise<IOptionsMarketDataResponse> {
    try {
      const response = await fetch(
        `${BASE_URL}/${this.symbol}/${MOCK_DATA_FOLDER}/market-data/${this.counter}`,
      );

      if (!response.ok) {
        // If we get a 404, we've reached the end of our mock data
        if (response.status === 404) {
          console.log('End of mock market data reached');
          return { results: [] };
        }
        throw new Error(`Failed to fetch mock market data: ${response.statusText}`);
      }

      const data = await response.json();
      const marketData = data.marketData as Record<string, IOptionsMarketData>;
      const lastTradePrice = data.lastTradePrice;
      const timestamp = data.timestamp;

      // Buffer logic
      if (!this.marketDataBuffer) {
        // First call: buffer and return price
        this.marketDataBuffer = { marketData, lastTradePrice, timestamp };
        this.lastTradePrice = lastTradePrice;
        if (this.symbol === 'QQQ') {
          const date = new Date(timestamp);
          const estTime = date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour12: false,
          });
          this._priceData$.set({ estTime, lastTradePrice: this.lastTradePrice });
        }
        this.counter++;
        return { results: Object.values(marketData) };
      } else {
        // Second and subsequent calls: return buffer, update buffer with new data
        const buffered = this.marketDataBuffer;
        this.marketDataBuffer = { marketData, lastTradePrice, timestamp };
        this.lastTradePrice = lastTradePrice;
        if (this.symbol === 'QQQ') {
          const date = new Date(buffered.timestamp);
          const estTime = date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour12: false,
          });
          this._priceData$.set({ estTime, lastTradePrice: buffered.lastTradePrice });
        }
        this.counter++;
        return { results: Object.values(buffered.marketData) };
      }
    } catch (error) {
      console.warn('Error fetching mock market data:', error);
      return { results: [] };
    }
  }

  async fetchActiveInstruments(symbol: string): Promise<IActiveInstrumentsResponse> {
    return this.baseRequestService.fetchActiveInstruments(symbol);
  }

  async fetchMarketDataQuotes(): Promise<IMarketDataQuotesResponse> {
    return {
      results: [
        {
          bid_price: this.lastTradePrice,
        },
      ],
    } as unknown as IMarketDataQuotesResponse;
  }

  /**
   * Fetches all pages of options instruments
   * @param chainId Chain ID to fetch instruments for
   * @param expirationDate Expiration date to filter by
   * @param type Option type (call or put)
   * @param state State filter (default: 'active')
   * @param accountNumber Account number (default: DEFAULT_ACCOUNT_NUMBER)
   * @returns Promise with all instruments across all pages
   */
  async fetchAllOptionsInstruments(
    chainId: string,
    expirationDate: string,
    type: 'call' | 'put',
  ): Promise<IOptionsInstrument[]> {
    try {
      // For mock service, we can just fetch the instruments once
      // since our mock data doesn't implement pagination
      const response = await this.fetchOptionsInstruments();

      // Filter results by the provided criteria
      return response.results.filter(
        instrument =>
          instrument.chain_id === chainId &&
          instrument.expiration_date === expirationDate &&
          instrument.type === type,
      );
    } catch (error) {
      console.error('Error fetching all mock options instruments:', error);
      return [];
    }
  }

  /**
   * Fetches all pages of aggregated positions
   * @param accountNumbers Account numbers to fetch positions for
   * @param nonzero Whether to fetch only non-zero positions
   * @param strategyCode Optional strategy code filter
   * @returns Promise with all positions across all pages
   */
  async fetchAllOptionsAggregatedPositions(
    accountNumbers: string = DEFAULT_ACCOUNT_NUMBER,
    nonzero: boolean = true,
    strategyCode?: string,
  ): Promise<IOptionsAggregatedPositionsResponse['results']> {
    // Delegate to the base service since we don't mock this endpoint
    return this.baseRequestService.fetchAllOptionsAggregatedPositions(
      accountNumbers,
      nonzero,
      strategyCode,
    );
  }

  /**
   * Fetches all pages of options orders
   * @param accountNumbers Account numbers to fetch orders for
   * @param states Order states to include
   * @returns Promise with all orders across all pages
   */
  async fetchAllOptionsOrders(
    accountNumbers: string = DEFAULT_ACCOUNT_NUMBER,
    states: string = 'queued,new,confirmed,unconfirmed,partially_filled,pending_cancelled',
  ): Promise<IOptionsOrdersResponse['results']> {
    // Delegate to the base service since we don't mock this endpoint
    return this.baseRequestService.fetchAllOptionsOrders(accountNumbers, states);
  }
}
