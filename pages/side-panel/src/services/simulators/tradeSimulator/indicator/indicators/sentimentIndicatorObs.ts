import { ISentimentDataService } from '../../data/sentimentData.service';

import { derived, IObservable, observableValue } from 'vs/base/common/observable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISentimentData } from '@src/services/sentiment2/sentimentData';
import {
  SentimentDataPoint,
  IPairedOptionData,
  SMADataPoint,
  IVolatilitySkewPoint,
  SentimentDataConfig,
} from '@src/services/sentiment2/sentimentUtils';

export interface SentimentIndicatorData {
  symbol: string;
  history: SentimentDataPoint[];
  sentiment: number;
  pairedOptions: IPairedOptionData[];
  sma10: number;
  smaHistory: SMADataPoint[];
  volatilitySkew: IVolatilitySkewPoint[];
  price: number | undefined; // Added price property for the underlying asset
}

export interface SentimentIndicatorConfig extends Partial<SentimentDataConfig> {
  expirationIndex?: number;
  expirationDate?: string;
}

export class SentimentIndicatorObs extends Disposable {
  private readonly _sentiment = observableValue<ISentimentData | undefined>('sentiment', undefined);
  public readonly indicatorData$: IObservable<SentimentIndicatorData | undefined>;

  constructor(
    private readonly symbol: string,
    private readonly config: SentimentIndicatorConfig,
    @ISentimentDataService private readonly sentimentDataService: ISentimentDataService,
  ) {
    super();
    void this.initializeSentiment();

    this.indicatorData$ = derived(reader => {
      const sentiment = this._sentiment.read(reader);
      if (!sentiment) return undefined;

      // Get the chain's last trade price from optionDataService
      const optionDataService = sentiment.optionDataService;
      const lastTradePrice = optionDataService?.optionsData$.get()?.lastTradePrice;

      if (this.config.expirationDate || typeof this.config.expirationIndex === 'number') {
        const sentimentByExpiration = sentiment.sentimentByExpiration$.read(reader);
        const historyByExpiration = sentiment.sentimentHistoryByExpiration$.read(reader);
        const smaByExpiration = sentiment.sentimentSMA10ByExpiration$.read(reader);
        const smaHistoryByExpiration = sentiment.sentimentSMAHistoryByExpiration$.read(reader);
        const pairedOptionsByExpiration = sentiment.pairedOptionsByExpiration$.read(reader);
        const volatilitySkewByExpiration = sentiment.volatilitySkewByExpiration$.read(reader);

        const expirationDates = Array.from(sentimentByExpiration.keys()).sort();
        let expDate = this.config.expirationDate;
        if (!expDate && typeof this.config.expirationIndex === 'number') {
          expDate = expirationDates[this.config.expirationIndex];
        }
        if (!expDate) return undefined;

        return {
          symbol: this.symbol,
          history: historyByExpiration.get(expDate) ?? [],
          sentiment: sentimentByExpiration.get(expDate) ?? 0,
          pairedOptions: pairedOptionsByExpiration.get(expDate) ?? [],
          sma10: smaByExpiration.get(expDate) ?? 0,
          smaHistory: smaHistoryByExpiration.get(expDate) ?? [],
          volatilitySkew: volatilitySkewByExpiration.get(expDate) ?? [],
          price: lastTradePrice, // Use the underlying instrument's last trade price
        };
      }

      return {
        symbol: this.symbol,
        history: sentiment.sentimentHistory$.read(reader),
        sentiment: sentiment.sentiment$.read(reader),
        pairedOptions: sentiment.pairedOptions$.read(reader),
        sma10: sentiment.sentimentSMA10$.read(reader),
        smaHistory: sentiment.sentimentSMAHistory$.read(reader),
        volatilitySkew: sentiment.volatilitySkewByExpiration$.read(reader).get('') || [],
        price: lastTradePrice, // Use the underlying instrument's last trade price
      };
    });
  }

  private async initializeSentiment(): Promise<void> {
    try {
      const sentiment = await this.sentimentDataService.get(this.symbol, this.config);
      this._sentiment.set(sentiment, undefined);
    } catch (error) {
      console.error(`Failed to initialize sentiment for ${this.symbol}:`, error);
    }
  }
}
