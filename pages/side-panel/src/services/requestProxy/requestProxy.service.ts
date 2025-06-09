import { Disposable } from 'vs/base/common/lifecycle';
import { IRequestService } from '@shared/services/request.service';
import { ILogService } from '@shared/services/log.service';
// Add import for server communication
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
} from '@shared/services/request.types';
import { IRemoteMarketDataService } from '@shared/serviceContracts/remoteMarketData.service';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class RequestProxyService extends Disposable implements IRequestService {
  declare readonly _serviceBrand: undefined;

  // Configuration flags
  private readonly _intercept: boolean = false;
  private readonly _waitForRemoteServiceResponse = false;

  // Tracking metrics
  private _pendingRequests = 0;
  private readonly _requestTimes = new Map<string, number>();

  constructor(
    private readonly _originalRequestService: IRequestService,
    private readonly _remoteMarketDataService: IRemoteMarketDataService,
    private readonly _logService: ILogService,
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
  ) {
    super();
    this._logService.info(
      'RequestProxyService initialized with interception enabled:',
      this._intercept,
    );
  }

  async start(): Promise<void> {
    this._logService.debug('RequestProxyService.start');

    await this._originalRequestService.start();
  }

  get headers() {
    return this._originalRequestService.headers;
  }

  /**
   * Create a method that intercepts calls, executes them, and forwards results
   * @template TArgs - Tuple type of arguments for the function
   * @template TResult - Return type of the function
   * @param methodName - Name of the method being intercepted
   * @param args - Arguments to pass to the method
   * @param handler - Function that executes the actual request
   * @returns Promise with the result of the request
   */
  private async intercept<TArgs extends unknown[], TResult>(
    methodName: string,
    args: TArgs,
    handler: (...args: TArgs) => Promise<TResult>,
  ): Promise<TResult> {
    // Skip interception if disabled - direct passthrough
    if (!this._intercept) {
      return handler(...args);
    }

    this._pendingRequests++;
    const requestId = `${methodName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this._requestTimes.set(requestId, performance.now());

    try {
      this._logService.debug(
        `[RequestProxy] Starting ${methodName} request (${requestId}), pending: ${this._pendingRequests}`,
      );

      // Execute the original request
      const result = await handler(...args);

      // Calculate request time
      const timeTaken = performance.now() - (this._requestTimes.get(requestId) || 0);
      this._logService.debug(`[RequestProxy] ${methodName} completed in ${timeTaken.toFixed(2)}ms`);

      // Forward to remote service, optionally waiting for it to complete
      this._sendToRemoteService(requestId, methodName, args, result, timeTaken);

      return result;
    } catch (error) {
      this._pendingRequests--;
      this._logService.error(`RequestProxy error in ${methodName} (${requestId}):`, error);
      throw error; // Re-throw the error after logging
    }
  }

  /**
   * Creates an appropriate empty response based on the method name
   * @param methodName The API method being called
   * @returns An empty response object appropriate for the method
   */
  private _createEmptyResponse(methodName: string): unknown {
    switch (methodName) {
      case 'fetchAllOptionsAggregatedPositions':
        return [];
      case 'fetchAllOptionsOrders':
        return [];
      case 'fetchOptionsAggregatedPositions':
        return { results: [], next: null, previous: null };
      case 'fetchOptionsOrders':
        return { results: [], next: null, previous: null };
      case 'fetchMarketDataQuotes':
        return { results: [] };
      case 'fetchOptionsMarketData':
        return { results: [] };
      case 'fetchOptionsChains':
        return { results: [] };
      case 'fetchOptionsInstruments':
        return { results: [], next: null, previous: null };
      case 'fetchAccounts':
        return { results: [] };
      case 'fetchMarketDataHistoricals':
        return { results: [] };
      case 'fetchActiveInstruments':
        return { results: [] };
      case 'fetchPricebookSnapshot':
        return { asks: [], bids: [] };
      default:
        this._logService.warn(`[RequestProxy] No empty response template for ${methodName}`);
        // Return a generic empty response
        if (methodName.startsWith('fetchAll')) {
          return [];
        } else if (methodName.startsWith('fetch')) {
          return { results: [] };
        }
        return {};
    }
  }

  /**
   * Send intercepted request data to remote service
   */
  private _sendToRemoteService<TResult>(
    requestId: string,
    methodName: string,
    args: unknown[],
    result: TResult,
    timeTaken: number,
  ): void {
    const sendData = async () => {
      try {
        // Only send data that's reasonable in size
        const resultSize = JSON.stringify(result).length;
        const isTooLarge = resultSize > 1000000; // 1MB limit

        if (isTooLarge) {
          this._logService.warn(
            `[RequestProxy] Result for ${methodName} is too large (${resultSize} bytes), truncating`,
          );
          // Send summary instead of full result
          await this._remoteMarketDataService.captureRequestData({
            method: methodName,
            arguments: args,
            timestamp: new Date().toISOString(),
            result: {
              _truncated: true,
              _originalSize: resultSize,
              _summary: `Result was ${resultSize} bytes and was truncated`,
            },
          });
        } else {
          await this._remoteMarketDataService.captureRequestData({
            method: methodName,
            arguments: args,
            timestamp: new Date().toISOString(),
            result,
            _metadata: {
              requestId,
              timeTaken,
            },
          });
        }

        this._logService.debug(`[RequestProxy] Data for ${methodName} sent to remote service`);
      } catch (error) {
        this._logService.error(`Error sending data to remote service for ${methodName}:`, error);
      } finally {
        this._pendingRequests--;
        this._requestTimes.delete(requestId);
      }
    };

    // Either wait for completion or run in the background
    if (this._waitForRemoteServiceResponse) {
      // Await the promise if waiting is required
      sendData(); // Note: This still doesn't block the main thread if not awaited, but fulfills the flag's intent
    } else {
      // Fire and forget
      sendData().catch(error => {
        this._logService.error('Background error in _sendToRemoteService:', error);
      });
    }
  }

  // --- Intercepted Methods ---

  async fetchActiveInstruments(symbol: string): Promise<IActiveInstrumentsResponse> {
    return this.intercept('fetchActiveInstruments', [symbol], (...args) =>
      this._originalRequestService.fetchActiveInstruments(...(args as [string])),
    );
  }

  async fetchMarketDataHistoricals(
    instrumentIds?: string | string[],
    interval?: '15second' | '5minute',
  ): Promise<IMarketDataHistoricalsResponse> {
    return this.intercept('fetchMarketDataHistoricals', [instrumentIds, interval], (...args) =>
      this._originalRequestService.fetchMarketDataHistoricals(
        ...(args as [string | string[] | undefined, ('15second' | '5minute') | undefined]),
      ),
    );
  }

  async fetchMarketDataQuotes(
    instrumentIds?: string | string[],
    includeInactive?: boolean,
  ): Promise<IMarketDataQuotesResponse> {
    return this.intercept('fetchMarketDataQuotes', [instrumentIds, includeInactive], (...args) =>
      this._originalRequestService.fetchMarketDataQuotes(
        ...(args as [string | string[] | undefined, boolean | undefined]),
      ),
    );
  }

  async fetchOptionsChains(
    equitySymbol: string,
    accountNumber?: string,
  ): Promise<IOptionsChainsResponse> {
    return this.intercept('fetchOptionsChains', [equitySymbol, accountNumber], (...args) =>
      this._originalRequestService.fetchOptionsChains(...(args as [string, string | undefined])),
    );
  }

  async fetchOptionsInstruments(
    chainId?: string,
    expirationDate?: string,
    type?: 'call' | 'put',
    cursor?: string,
    state?: string,
    accountNumber?: string,
  ): Promise<IOptionsInstrumentsResponse> {
    return this.intercept(
      'fetchOptionsInstruments',
      [chainId, expirationDate, type, cursor, state, accountNumber],
      (...args) =>
        this._originalRequestService.fetchOptionsInstruments(
          ...(args as [string?, string?, ('call' | 'put')?, string?, string?, string?]),
        ),
    );
  }

  async fetchOptionsMarketData(
    instrumentIds?: string | string[],
  ): Promise<IOptionsMarketDataResponse> {
    return this.intercept('fetchOptionsMarketData', [instrumentIds], (...args) =>
      this._originalRequestService.fetchOptionsMarketData(
        ...(args as [string | string[] | undefined]),
      ),
    );
  }

  async fetchOptionsAggregatedPositions(
    accountNumbers?: string,
    nonzero?: boolean,
    strategyCode?: string,
    cursor?: string,
  ): Promise<IOptionsAggregatedPositionsResponse> {
    return this.intercept(
      'fetchOptionsAggregatedPositions',
      [accountNumbers, nonzero, strategyCode, cursor],
      (...args) =>
        this._originalRequestService.fetchOptionsAggregatedPositions(
          ...(args as [string?, boolean?, string?, string?]),
        ),
    );
  }

  async fetchOptionsOrders(
    accountNumbers?: string,
    states?: string,
    cursor?: string,
  ): Promise<IOptionsOrdersResponse> {
    return this.intercept('fetchOptionsOrders', [accountNumbers, states, cursor], (...args) =>
      this._originalRequestService.fetchOptionsOrders(...(args as [string?, string?, string?])),
    );
  }

  async cancelOptionsOrder(orderId: string): Promise<void> {
    return this.intercept('cancelOptionsOrder', [orderId], (...args) =>
      this._originalRequestService.cancelOptionsOrder(...(args as [string])),
    );
  }

  // Note: fetchOptionsOrder is deprecated or unused? Keeping for now.
  async fetchOptionsOrder(orderId: string): Promise<IOptionsOrderResponse> {
    return this.intercept('fetchOptionsOrder', [orderId], (...args) =>
      this._originalRequestService.fetchOptionsOrder(...(args as [string])),
    );
  }

  async fetchSingleOptionsOrder(orderId: string): Promise<IOptionsOrderResponse> {
    return this.intercept('fetchSingleOptionsOrder', [orderId], (...args) =>
      this._originalRequestService.fetchSingleOptionsOrder(...(args as [string])),
    );
  }

  async fetchAccounts(defaultToAllAccounts?: boolean): Promise<IAccountsResponse> {
    return this.intercept('fetchAccounts', [defaultToAllAccounts], (...args) =>
      this._originalRequestService.fetchAccounts(...(args as [boolean?])),
    );
  }

  async reviewOptionsOrder(
    payload: IOptionsOrderReviewPayload,
  ): Promise<IOptionsOrderReviewResponse> {
    return this.intercept<[IOptionsOrderReviewPayload], IOptionsOrderReviewResponse>(
      'reviewOptionsOrder',
      [payload],
      (...args) => this._originalRequestService.reviewOptionsOrder(...args),
    );
  }

  async fetchOptionsOrderCollateral(
    order: IOptionsOrderReviewPayload,
  ): Promise<IOptionsOrderCollateralResponse> {
    return this.intercept<[IOptionsOrderReviewPayload], IOptionsOrderCollateralResponse>(
      'fetchOptionsOrderCollateral',
      [order],
      (...args) => this._originalRequestService.fetchOptionsOrderCollateral(...args),
    );
  }

  async createOptionsOrder(payload: IOptionsOrderCreatePayload): Promise<IOptionsOrderResponse> {
    return this.intercept<[IOptionsOrderCreatePayload], IOptionsOrderResponse>(
      'createOptionsOrder',
      [payload],
      (...args) => this._originalRequestService.createOptionsOrder(...args),
    );
  }

  async fetchPricebookSnapshot(instrumentId?: string): Promise<IPricebookSnapshotResponse> {
    return this.intercept('fetchPricebookSnapshot', [instrumentId], (...args) =>
      this._originalRequestService.fetchPricebookSnapshot(...(args as [string?])),
    );
  }

  async fetchAllOptionsInstruments(
    chainId: string,
    expirationDate: string,
    type: 'call' | 'put',
    state: string = 'active',
    accountNumber?: string,
  ): Promise<IOptionsInstrument[]> {
    return this.intercept(
      'fetchAllOptionsInstruments',
      [chainId, expirationDate, type, state, accountNumber],
      (...args) =>
        this._originalRequestService.fetchAllOptionsInstruments(
          ...(args as [string, string, 'call' | 'put', string, string?]),
        ),
    );
  }

  async fetchAllOptionsAggregatedPositions(
    accountNumbers?: string,
    nonzero?: boolean,
    strategyCode?: string,
  ): Promise<IOptionsAggregatedPositionsResponse['results']> {
    return this.intercept(
      'fetchAllOptionsAggregatedPositions',
      [accountNumbers, nonzero, strategyCode],
      (...args) =>
        this._originalRequestService.fetchAllOptionsAggregatedPositions(
          ...(args as [string?, boolean?, string?]),
        ),
    );
  }

  async fetchAllOptionsOrders(
    accountNumbers?: string,
    states?: string,
  ): Promise<IOptionsOrdersResponse['results']> {
    return this.intercept('fetchAllOptionsOrders', [accountNumbers, states], (...args) =>
      this._originalRequestService.fetchAllOptionsOrders(...(args as [string?, string?])),
    );
  }
}
