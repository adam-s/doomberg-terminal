import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import {
  IActiveInstrumentsResponse,
  IMarketDataHistoricalsResponse,
  IMarketDataQuotesResponse,
  IOptionsChainsResponse,
  IOptionsInstrumentsResponse,
  IOptionsMarketDataResponse,
  IOptionsAggregatedPositionsResponse,
  IOptionsOrderResponse,
  IAccountsResponse,
  IOptionsOrderReviewPayload,
  IOptionsOrderReviewResponse,
  IOptionsOrderCollateralResponse,
  IOptionsOrderCreatePayload,
  IOptionsOrdersResponse,
  IPricebookSnapshotResponse,
  IOptionsInstrument,
} from './request.types';
import { observableValue, type ISettableObservable } from 'vs/base/common/observable';

export const DEFAULT_ACCOUNT_NUMBER =
  'IF_YOU_PUT_YOUR_ACCOUNT_NUMBER_HERE_YOU_AND_ONLY_YOU_ARE_RESPONSIBLE_FOR_ANY_CONSEQUENCES_AND_WILL_NOT_HOLD_ANYONE_OR_ANYTHING_RESPONSIBLE';

export const ROBINHOOD_HEADER_KEYS = [
  'Authorization',
  'X-Hyper-Ex',
  'X-Robinhood-API-Version',
  'X-TimeZone-Id',
] as const;

export type RobinhoodHeaderKey = (typeof ROBINHOOD_HEADER_KEYS)[number];
export type RobinhoodHeaders = Record<RobinhoodHeaderKey, string>;

const headersToTrack: RobinhoodHeaders = Object.fromEntries(
  ROBINHOOD_HEADER_KEYS.map(key => [key, '']),
) as RobinhoodHeaders;

export interface IRequestService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
  headers: ISettableObservable<RobinhoodHeaders>;
  fetchActiveInstruments: (symbol: string) => Promise<IActiveInstrumentsResponse>;
  fetchMarketDataHistoricals: (
    instrumentIds?: string | string[],
    interval?: '15second' | '5minute',
  ) => Promise<IMarketDataHistoricalsResponse>;
  fetchMarketDataQuotes: (
    instrumentIds?: string | string[],
    includeInactive?: boolean,
  ) => Promise<IMarketDataQuotesResponse>;
  fetchOptionsChains: (
    equitySymbol: string,
    accountNumber?: string,
  ) => Promise<IOptionsChainsResponse>;
  fetchOptionsInstruments: (
    chainId?: string,
    expirationDate?: string,
    type?: 'call' | 'put',
    cursor?: string,
    state?: string,
    accountNumber?: string,
  ) => Promise<IOptionsInstrumentsResponse>;
  fetchOptionsMarketData: (
    instrumentIds?: string | string[],
  ) => Promise<IOptionsMarketDataResponse>;
  fetchOptionsAggregatedPositions: (
    accountNumbers?: string,
    nonzero?: boolean,
    strategyCode?: string,
    cursor?: string,
  ) => Promise<IOptionsAggregatedPositionsResponse>;
  fetchOptionsOrders: (
    accountNumbers?: string,
    states?: string,
    cursor?: string,
  ) => Promise<IOptionsOrdersResponse>;
  cancelOptionsOrder: (orderId: string) => Promise<void>;
  fetchOptionsOrder: (orderId: string) => Promise<IOptionsOrderResponse>;
  fetchAccounts: (defaultToAllAccounts?: boolean) => Promise<IAccountsResponse>;
  reviewOptionsOrder: (payload: IOptionsOrderReviewPayload) => Promise<IOptionsOrderReviewResponse>;
  fetchOptionsOrderCollateral: (
    order: IOptionsOrderReviewPayload,
  ) => Promise<IOptionsOrderCollateralResponse>;
  createOptionsOrder: (payload: IOptionsOrderCreatePayload) => Promise<IOptionsOrderResponse>;
  fetchPricebookSnapshot: (instrumentId?: string) => Promise<IPricebookSnapshotResponse>;
  fetchSingleOptionsOrder: (orderId: string) => Promise<IOptionsOrderResponse>;
  // Add new pagination methods
  fetchAllOptionsInstruments: (
    chainId: string,
    expirationDate: string,
    type: 'call' | 'put',
    state?: string,
    accountNumber?: string,
  ) => Promise<IOptionsInstrument[]>;
  fetchAllOptionsAggregatedPositions: (
    accountNumbers?: string,
    nonzero?: boolean,
    strategyCode?: string,
  ) => Promise<IOptionsAggregatedPositionsResponse['results']>;
  fetchAllOptionsOrders: (
    accountNumbers?: string,
    states?: string,
  ) => Promise<IOptionsOrdersResponse['results']>;
}

export const IRequestService = createDecorator<IRequestService>('requestService');

export class RequestService extends Disposable implements IRequestService {
  declare readonly _serviceBrand: undefined;

  public readonly headers = observableValue<RobinhoodHeaders>('headers', { ...headersToTrack });

  constructor() {
    super();
    this._registerListeners();
    this._overrideXML();
  }

  async fetchActiveInstruments(symbol: string): Promise<IActiveInstrumentsResponse> {
    const url = `https://api.robinhood.com/instruments/?active_instruments_only=false&symbol=${symbol}`;
    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchMarketDataHistoricals(
    instrumentIds: string | string[] = ['1790dd4f-a7ff-409e-90de-cad5efafde10'],
    interval: '15second' | '5minute' = '5minute',
  ): Promise<IMarketDataHistoricalsResponse> {
    const ids = Array.isArray(instrumentIds) ? instrumentIds.join(',') : instrumentIds;
    const url = `https://api.robinhood.com/marketdata/historicals/?bounds=24_5&ids=${ids}&interval=${interval}${interval === '5minute' ? '&span=day' : ''}`;

    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
      },
    });

    return await response.json();
  }

  async fetchMarketDataQuotes(
    instrumentIds: string | string[] = ['1790dd4f-a7ff-409e-90de-cad5efafde10'],
    includeInactive: boolean = true,
  ): Promise<IMarketDataQuotesResponse> {
    const ids = Array.isArray(instrumentIds) ? instrumentIds.join(',') : instrumentIds;
    const url = `https://api.robinhood.com/marketdata/quotes/?bounds=24_5&ids=${encodeURIComponent(
      ids,
    )}&include_inactive=${includeInactive}`;

    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchOptionsChains(
    equitySymbol: string = 'QQQ',
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
  ): Promise<IOptionsChainsResponse> {
    const url = `https://api.robinhood.com/options/chains/?account_number=${encodeURIComponent(
      accountNumber,
    )}&equity_symbol=${encodeURIComponent(equitySymbol)}`;

    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchOptionsInstruments(
    chainId: string = 'a95fe906-11f0-4699-bfc2-520dd706e98d',
    expirationDate: string = '2024-11-05',
    type: 'call' | 'put' = 'call',
    cursor?: string,
    state: string = 'active',
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
  ): Promise<IOptionsInstrumentsResponse> {
    let url;

    if (cursor) {
      url = cursor;
    } else {
      url = new URL('https://api.robinhood.com/options/instruments/');

      const params = new URLSearchParams({
        account_number: accountNumber,
        chain_id: chainId,
      });
      if (cursor) {
        params.append('cursor', cursor);
      }
      params.append('expiration_dates', expirationDate);
      params.append('state', state);
      params.append('type', type);
      url.search = params.toString();
    }

    const headers = this.headers.get();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchOptionsMarketData(
    instrumentIds:
      | string
      | string[] = 'fe64d565-ab42-4317-8a21-17392fbbe00b,fd191019-06fd-4ec3-a352-4b67de5f57e8,fcd2fc0b-5297-4daa-b4fb-52175b76e0e9,fc63ebd4-32f8-49a4-a4d7-5fdbff848485,fa7ec08a-019c-4968-9501-c20b0d98923f,f8b8300d-2697-4b09-84be-052607f94448,f82c7e6f-50d8-4ca5-b231-4c362301d116,f5b0337e-332e-4f29-8c86-50899d454c8b,f2cbaf4c-c0d1-4d11-a2d2-2169eee29e4d,f019621b-bd75-4057-aec2-a34fa91c1c89,edd5219b-2a24-414f-9ccf-a0a84251479d,ed86354e-174c-4851-9082-185d9892fa4d,ed527796-c02a-4b44-bf13-a26ed5722c84,eadee1df-43fc-4f1a-9156-30364ade4415,ea35f4fb-722f-4422-ba8d-b769a0150127,e97cfd57-51f0-411d-bb7d-9f4f785d2953,e6fd59fd-ae73-4973-9a4c-1d3bfd54dbf0,e64d7e4c-1071-4b72-bb07-0d9dfdc8fcb3,e63608d7-ff30-4e32-b2d9-cb8d626354de,e5ee6dd9-e399-4c0f-972c-5735fa95ebf4,db04931c-89e4-43c5-991e-74c1a2daaef8,da256ca7-8fea-48cd-8920-0da513b305ac,d3f5fada-3f1c-4196-8e49-58b288f6172d,d2263249-1fb0-4cb8-b551-8b131ab0b5f6,d16d0759-467c-46d3-97b2-5a77c0ec4d1d,cff240dd-cce0-42f1-ac42-6ed3788bce6a,cc43afe3-4131-4bd2-8081-781e685c3b4f,cabe5ca5-8da9-40a4-a463-0c9686b98ff7,c5a3d120-d2f6-4a80-bd99-f0eceeea6742,bb8629a5-4f20-429c-8d55-b00d11a3e34f,bb234418-f8f7-4030-94f2-21e402d16712,ba1f6a3d-93ac-464d-aff6-d573af7f53fb,b7f4409b-893d-40b5-a1a2-78694c0b07f6,b786c71a-4b3a-4e23-9655-db8d18f5c797,b6e6ed86-f899-4c6f-ad93-63f0c447d136,b5c4400c-f77a-4dc7-af80-d041fadc8f4b,b4a2755e-88b3-4ab6-97ca-96aabf8e1846,a9ba82d2-8ac8-4d47-a782-67039098ba16,a739cd89-dcbf-4ff3-a828-38ca8e41086b,a64bfbc4-f7ba-4dc9-b173-2cacc89073f7',
  ): Promise<IOptionsMarketDataResponse> {
    const ids = Array.isArray(instrumentIds) ? instrumentIds.join(',') : instrumentIds;
    const url = `https://api.robinhood.com/marketdata/options/?ids=${encodeURIComponent(ids)}`;

    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchOptionsAggregatedPositions(
    accountNumbers: string = DEFAULT_ACCOUNT_NUMBER,
    nonzero: boolean = true,
    strategyCode?: string,
    cursor?: string,
  ): Promise<IOptionsAggregatedPositionsResponse> {
    let url;

    if (cursor) {
      url = cursor;
    } else {
      url = new URL('https://api.robinhood.com/options/aggregate_positions/');
      const params = new URLSearchParams({
        account_numbers: accountNumbers,
        nonzero: String(nonzero),
      });

      if (strategyCode) {
        params.append('strategy_code', strategyCode);
      }

      url.search = params.toString();
    }

    const headers = this.headers.get();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchOptionsOrders(
    accountNumbers: string = DEFAULT_ACCOUNT_NUMBER,
    states: string = 'queued,new,confirmed,unconfirmed,partially_filled,pending_cancelled',
    cursor?: string,
  ): Promise<IOptionsOrdersResponse> {
    let url: URL;

    if (cursor) {
      url = new URL(cursor);
    } else {
      url = new URL('https://api.robinhood.com/options/orders/');
      const params = new URLSearchParams();
      params.append('account_numbers', accountNumbers);
      params.append('states', states);
      url.search = params.toString();
    }

    const headers = this.headers.get();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async cancelOptionsOrder(orderId: string): Promise<void> {
    const url = `https://api.robinhood.com/options/orders/${orderId}/cancel/`;
    const headers = this.headers.get();

    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });
  }

  async fetchOptionsOrder(orderId: string): Promise<IOptionsOrderResponse> {
    const url = `https://api.robinhood.com/options/orders/${orderId}/`;

    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-Api-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async fetchSingleOptionsOrder(orderId: string): Promise<IOptionsOrderResponse> {
    const url = `https://api.robinhood.com/options/orders/${orderId}/`;
    const headers = this.headers.get();

    const response = await fetch(url, {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-API-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async fetchAccounts(defaultToAllAccounts: boolean = true): Promise<IAccountsResponse> {
    const url = new URL('https://api.robinhood.com/accounts/');
    const params = new URLSearchParams({
      default_to_all_accounts: String(defaultToAllAccounts),
    });
    url.search = params.toString();

    const headers = this.headers.get();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-API-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    return await response.json();
  }

  async reviewOptionsOrder(
    payload: IOptionsOrderReviewPayload,
  ): Promise<IOptionsOrderReviewResponse> {
    const url = 'https://bonfire.robinhood.com/options/orders/review';
    const headers = this.headers.get();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async fetchOptionsOrderCollateral(
    order: IOptionsOrderReviewPayload,
  ): Promise<IOptionsOrderCollateralResponse> {
    const url = new URL('https://api.robinhood.com/options/orders/collateral/');
    url.searchParams.append('order', JSON.stringify(order));

    const headers = this.headers.get();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-API-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async createOptionsOrder(payload: IOptionsOrderCreatePayload): Promise<IOptionsOrderResponse> {
    const url = 'https://api.robinhood.com/options/orders/';
    const headers = this.headers.get();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-Robinhood-API-Version': headers['X-Robinhood-API-Version'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // Add new method to fetch a pricebook snapshot
  async fetchPricebookSnapshot(
    instrumentId: string = '1790dd4f-a7ff-409e-90de-cad5efafde10',
  ): Promise<IPricebookSnapshotResponse> {
    const url = `https://api.robinhood.com/marketdata/pricebook/snapshots/${instrumentId}/`;
    const headers = this.headers.get();
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: headers['Authorization'],
        'X-Hyper-Ex': headers['X-Hyper-Ex'],
        'X-TimeZone-Id': headers['X-TimeZone-Id'],
      },
    });
    return await response.json();
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
    state: string = 'active',
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
  ): Promise<IOptionsInstrument[]> {
    let allInstruments: IOptionsInstrument[] = [];
    let nextCursor: string | null | undefined;

    do {
      const response = await this.fetchOptionsInstruments(
        chainId,
        expirationDate,
        type,
        nextCursor || undefined,
        state,
        accountNumber,
      );

      allInstruments = [...allInstruments, ...response.results];
      nextCursor = response.next;
    } while (nextCursor);

    return allInstruments;
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
    let allPositions: IOptionsAggregatedPositionsResponse['results'] = [];
    let nextCursor: string | null | undefined;

    do {
      const response = await this.fetchOptionsAggregatedPositions(
        accountNumbers,
        nonzero,
        strategyCode,
        nextCursor || undefined,
      );

      allPositions = [...allPositions, ...response.results];
      nextCursor = response.next;
    } while (nextCursor);

    return allPositions;
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
    let allOrders: IOptionsOrdersResponse['results'] = [];
    let nextCursor: string | null | undefined;

    do {
      const response = await this.fetchOptionsOrders(
        accountNumbers,
        states,
        nextCursor || undefined,
      );

      allOrders = [...allOrders, ...response.results];
      nextCursor = response.next;
    } while (nextCursor);

    return allOrders;
  }

  _registerListeners() {}

  async start() {}

  private _overrideXML() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    (function (originalSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader) {
      let completed = false;
      XMLHttpRequest.prototype.setRequestHeader = function (header: string, value: string): void {
        const xhr = this as XMLHttpRequest;

        if (Object.hasOwn(headersToTrack, header)) {
          if (completed && headersToTrack[header as RobinhoodHeaderKey] !== value) {
            // Single set with explicit undefined since this is the only set in this branch
            headersToTrack[header as RobinhoodHeaderKey] = value;
            self.headers.set({ ...headersToTrack }, undefined);
            console.log('########################## header has been updated');
          } else {
            headersToTrack[header as RobinhoodHeaderKey] = value;
          }
        }

        if (!completed && Object.values(headersToTrack).every(val => val !== '')) {
          completed = true;
          // Single set with explicit undefined since this is the only set in this branch
          self.headers.set({ ...headersToTrack }, undefined);
        }

        originalSetRequestHeader.call(xhr, header, value);
      };
    })(XMLHttpRequest.prototype.setRequestHeader);
  }
}
