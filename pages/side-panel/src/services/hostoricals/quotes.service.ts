import { IRequestService } from '@shared/services/request.service';
import {
  IActiveInstruments,
  IActiveInstrumentsResponse,
  IMarketDataQuotesResponse,
  IMarketDataQuotesResult,
} from '@shared/services/request.types';
import { autorun, derived, observableValue } from 'vs/base/common/observable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITimerService } from '@src/services/timer.service';
import { calculateSMAForSymbol, calculatePercentChangesForSymbol } from './utils';

const TICKERS_TO_TRACK = ['QQQ', 'SPY', 'DIA'];
const QUOTES_INTERVAL = 1000; // 1 second
const SIZE = 60 * 5; // 5 minutes

interface QuotesHistory {
  [symbol: string]: IMarketDataQuotesResult[];
}

interface BidPriceHistory {
  [symbol: string]: number[];
}

interface BidPriceChanges {
  [symbol: string]: number[];
}

interface BidPriceSMA {
  [symbol: string]: number[];
}

export class QuotesService extends Disposable {
  private trackedTickers = new Map<string, IActiveInstruments>();
  private readonly _quotesTimerId = 'quotes-service-update';

  public marketDataQuotes = observableValue<IMarketDataQuotesResponse | undefined>(
    'marketDataQuotes',
    undefined,
  );

  public readonly quotesHistory = observableValue<QuotesHistory>('quotesHistory', {});

  // Optional: Add this if you need quick access to latest quotes
  public readonly latestQuotes = derived(this, reader => {
    const history = this.quotesHistory.read(reader);
    const latest: Partial<Record<string, IMarketDataQuotesResult>> = {};

    for (const [symbol, quotes] of Object.entries(history)) {
      if (quotes.length > 0) {
        latest[symbol] = quotes[quotes.length - 1];
      }
    }

    return latest;
  });

  public readonly bidPriceHistory = derived(this, reader => {
    const history = this.quotesHistory.read(reader);
    const bidHistory: BidPriceHistory = {};

    for (const [symbol, quotes] of Object.entries(history)) {
      bidHistory[symbol] = quotes.map(quote => Number(quote.bid_price));
    }

    return bidHistory;
  });

  public readonly bidPriceSMA = derived(this, reader => {
    const history = this.bidPriceHistory.read(reader);
    const sma: BidPriceSMA = {};
    const period = 120; // 2 minutes

    for (const [symbol, prices] of Object.entries(history)) {
      sma[symbol] = calculateSMAForSymbol(prices, period, SIZE);
    }

    return sma;
  });

  public readonly bidPricePercentChanges = derived(this, reader => {
    const smaValues = this.bidPriceSMA.read(reader);
    const changes: BidPriceChanges = {};

    for (const [symbol, averages] of Object.entries(smaValues)) {
      changes[symbol] = calculatePercentChangesForSymbol(averages, SIZE);
    }

    return changes;
  });

  constructor(
    @IRequestService private readonly requestService: IRequestService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();

    this._register(
      autorun(reader => {
        const quotes = this.marketDataQuotes.read(reader);
        if (!quotes) {
          return;
        }

        const currentHistory = this.quotesHistory.get();
        const updatedHistory = { ...currentHistory };

        for (const quote of quotes.results) {
          if (!updatedHistory[quote.symbol]) {
            updatedHistory[quote.symbol] = [];
          }
          updatedHistory[quote.symbol] = [...updatedHistory[quote.symbol], { ...quote }];
          if (updatedHistory[quote.symbol].length > SIZE) {
            updatedHistory[quote.symbol] = updatedHistory[quote.symbol].slice(1);
          }
        }

        this.quotesHistory.set(updatedHistory, undefined);
      }),
    );
  }

  async start() {
    // Initial setup of tracked tickers
    for (const symbol of TICKERS_TO_TRACK) {
      const response: IActiveInstrumentsResponse =
        await this.requestService.fetchActiveInstruments(symbol);
      const matchedInstrument = response.results.find(instrument => instrument.symbol === symbol);
      if (matchedInstrument) {
        this.trackedTickers.set(symbol, matchedInstrument);
      }
    }

    // Initial fetch
    await this.fetchQuotes();

    // Setup interval using timer service
    this._register(
      this.timerService.subscribeToTimer(this._quotesTimerId, QUOTES_INTERVAL, () =>
        this.fetchQuotes().catch(console.error),
      ),
    );
  }

  private async fetchQuotes() {
    const instrumentIds = Array.from(this.trackedTickers.values()).map(instr => instr.id);
    const quotes = await this.requestService.fetchMarketDataQuotes(instrumentIds);
    this.marketDataQuotes.set(quotes, undefined);
  }

  override dispose(): void {
    this.timerService.stopTimer(this._quotesTimerId);
    super.dispose();
  }
}
