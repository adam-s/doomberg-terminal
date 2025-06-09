import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface XMLHttpRequestWithMethod extends XMLHttpRequest {
  _method?: string;
}

interface Message {
  type: 'XMLOverrideMessage';
  url: string;
  response: unknown;
  requestData?: unknown;
}

const urls = [
  'https://api.robinhood.com/marketdata/options',
  'https://api.robinhood.com/marketdata/quotes',
  'https://api.robinhood.com/marketdata/fundamentals',
  'https://api.robinhood.com/marketdata/historicals',
  'https://api.robinhood.com/marketdata/earnings',
  'https://bonfire.robinhood.com/options',
  'https://api.robinhood.com/options',
  'https://api.robinhood.com/positions',
  'https://bonfire.robinhood.com/instruments',
  'https://api.robinhood.com/markets',
  'https://api.robinhood.com/instruments',
  'https://api.robinhood.com/orders',
];

const containsUrl = (url: string) => urls.some(u => url.startsWith(u));

export interface IInterceptorService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
  onResponse: Event<unknown>;
  makeRequest: () => Promise<void>;
}

export const IInterceptorService =
  createDecorator<IInterceptorService>('interceptorService');

export class InterceptorService
  extends Disposable
  implements IInterceptorService
{
  declare readonly _serviceBrand: undefined;

  private _onResponse = this._register(new Emitter());
  readonly onResponse: Event<unknown> = this._onResponse.event;

  constructor() {
    super();
    this._registerListeners();
    this._overrideXML();
  }

  public async makeRequest() {}

  private _overrideXML() {
    const onResponse = this._onResponse.fire.bind(this);

    (function (
      open: typeof XMLHttpRequest.prototype.open,
      send: typeof XMLHttpRequest.prototype.send,
    ) {
      XMLHttpRequest.prototype.open = function (
        method: string,
        url: string,
        async: boolean = true,
        user?: string | null,
        password?: string | null,
      ): void {
        const xhr = this as XMLHttpRequestWithMethod;
        xhr._method = method;
        open.call(xhr, method, url, async, user, password);
      };

      XMLHttpRequest.prototype.send = function (
        data?: Document | XMLHttpRequestBodyInit | null,
      ): void {
        const xhr = this as XMLHttpRequestWithMethod;
        const originalOnReadyStateChange = xhr.onreadystatechange;

        xhr.onreadystatechange = function (event) {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            const url = xhr.responseURL;
            if (containsUrl(url)) {
              try {
                const response = JSON.parse(xhr.responseText);
                const message: Message = {
                  type: 'XMLOverrideMessage',
                  url,
                  response,
                };

                if (xhr._method?.toLowerCase() === 'post' && data) {
                  try {
                    if (typeof data === 'string') {
                      message.requestData = JSON.parse(data);
                    } else if (data instanceof Document) {
                      message.requestData = data;
                    } else {
                      message.requestData = data;
                    }
                  } catch (error) {
                    console.error('Request data parsing failed.', error);
                    message.requestData = data;
                  }
                }
                onResponse(message);
              } catch (error) {
                console.error('Response parsing failed.', error);
              }
            }
          }
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.call(xhr, event);
          }
        };

        try {
          send.call(xhr, data);
        } catch (error) {
          console.error('Send failed.', error);
        }
      };
    })(XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send);
  }

  private _registerListeners() {}

  async start() {}
}
