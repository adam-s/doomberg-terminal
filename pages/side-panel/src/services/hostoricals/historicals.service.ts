import { IRequestService } from '@shared/services/request.service';
import {
  IActiveInstruments,
  IActiveInstrumentsResponse,
  IMarketDataHistoricalsResponse,
  IMarketDataQuotesResponse,
} from '@shared/services/request.types';
import { observableValue } from 'vs/base/common/observable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITimerService } from '@src/services/timer.service';

const TICKERS_TO_TRACK = ['QQQ', 'SPY', 'DIA'];
const REFRESH_INTERVAL = 15_000; // 15 seconds

export class HistoricalsService extends Disposable {
  private trackedTickers = new Map<string, IActiveInstruments>();
  private readonly _historicalsTimerId = 'historicals-update';
  private readonly _quotesTimerId = 'historicals-quotes';

  public marketDataHistoricals = observableValue<IMarketDataHistoricalsResponse | undefined>(
    'marketDataHistoricals',
    undefined,
  );
  public marketDataQuotes = observableValue<IMarketDataQuotesResponse | undefined>(
    'marketDataQuotes',
    undefined,
  );

  constructor(
    @IRequestService private readonly requestService: IRequestService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();
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

    // Initial fetches
    await this.fetchHistoricals();
    await this.fetchQuotes();

    // Set up timer subscriptions for periodic updates
    this._register(
      this.timerService.subscribeToTimer(this._historicalsTimerId, REFRESH_INTERVAL, () =>
        this.fetchHistoricals().catch(console.error),
      ),
    );

    this._register(
      this.timerService.subscribeToTimer(this._quotesTimerId, REFRESH_INTERVAL, () =>
        this.fetchQuotes().catch(console.error),
      ),
    );
  }

  private async fetchHistoricals() {
    const instrumentIds = Array.from(this.trackedTickers.values()).map(instr => instr.id);

    const marketDataHistoricals = await this.requestService.fetchMarketDataHistoricals(
      instrumentIds,
      '15second',
    );

    this.marketDataHistoricals.set(marketDataHistoricals, undefined);
  }

  private async fetchQuotes() {
    const instrumentIds = Array.from(this.trackedTickers.values()).map(instr => instr.id);

    const quotes = await this.requestService.fetchMarketDataQuotes(instrumentIds);
    this.marketDataQuotes.set(quotes, undefined);
  }

  override dispose(): void {
    // Stop timers
    this.timerService.stopTimer(this._historicalsTimerId);
    this.timerService.stopTimer(this._quotesTimerId);
    super.dispose();
  }
}
