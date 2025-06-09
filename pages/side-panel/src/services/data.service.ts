import { Disposable } from 'vs/base/common/lifecycle';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { AggregatedPositionsService } from '@src/services/aggregatedPositions/aggregatedPositions.service';
import { HistoricalsService } from '@src/services/hostoricals/historicals.service';
import { OptionsChainsService } from './chains/optionsChains.service';
import { ExtrinsicDataService } from './extrinsicValue/extrinsicData.service';
import { PricebooksService } from './pricebook/pricebooks.service';
import { QuotesService } from './hostoricals/quotes.service';
import { SentimentService } from './sentiment2/sentiment.service';

export const IDataService = createDecorator<IDataService>('dataService');

export interface IDataService {
  readonly _serviceBrand: undefined;
  aggregatedPositionsService: AggregatedPositionsService;
  historicalsService: HistoricalsService;
  quotesService: QuotesService;
  optionsChainsService: OptionsChainsService;
  extrinsicDataService: ExtrinsicDataService;
  pricebooksService: PricebooksService;
  sentimentService: SentimentService;
  start(): Promise<void>;
}

export class DataService extends Disposable implements IDataService {
  declare readonly _serviceBrand: undefined;

  aggregatedPositionsService!: AggregatedPositionsService;
  historicalsService!: HistoricalsService;
  quotesService!: QuotesService;
  optionsChainsService!: OptionsChainsService;
  extrinsicDataService!: ExtrinsicDataService;
  pricebooksService!: PricebooksService;
  sentimentService!: SentimentService;

  constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
    super();
  }

  async start() {
    this.aggregatedPositionsService = this._register(
      this.instantiationService.createInstance(AggregatedPositionsService),
    );
    await this.aggregatedPositionsService.start();

    this.historicalsService = this._register(
      this.instantiationService.createInstance(HistoricalsService),
    );
    await this.historicalsService.start();

    this.optionsChainsService = this._register(
      this.instantiationService.createInstance(OptionsChainsService),
    );

    this.pricebooksService = this._register(
      this.instantiationService.createInstance(PricebooksService),
    );

    this.extrinsicDataService = this._register(
      this.instantiationService.createInstance(ExtrinsicDataService, this.optionsChainsService),
    );

    this.sentimentService = this._register(
      this.instantiationService.createInstance(SentimentService, this.optionsChainsService),
    );

    this.quotesService = this._register(this.instantiationService.createInstance(QuotesService));
    await this.quotesService.start();
  }
}
