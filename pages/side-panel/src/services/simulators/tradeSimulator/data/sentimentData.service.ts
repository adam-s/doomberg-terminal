import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChainDataService } from './chainData.service';
import { ISentimentData, SentimentData } from '@src/services/sentiment2/sentimentData';
import {
  SentimentDataConfig,
  BaseSentimentDataConfig,
  StrikeSelectionMode,
} from '@src/services/sentiment2/sentimentUtils';

export const ISentimentDataService = createDecorator<ISentimentDataService>('sentimentDataService');

export interface ISentimentDataService {
  readonly _serviceBrand: undefined;
  get: (symbol: string, config?: Partial<SentimentDataConfig>) => Promise<ISentimentData>;
  dispose(): void;
}

/**
 * Default configuration values for sentiment calculations
 */
const DEFAULT_CONFIG: BaseSentimentDataConfig = {
  maxHistorySize: 500,
  numStrikes: 40,
  period: 10,
  sentimentBeta: 0.2,
  sentimentMaxDeltaMatch: 0.85,
  volumeWeight: 0.85,
  normalizeByATM: false,
  strikeSelectionMode: StrikeSelectionMode.BOTH,
};

export class SentimentDataService extends Disposable implements ISentimentDataService {
  declare readonly _serviceBrand: undefined;

  private readonly sentimentDataMap = new Map<string, ISentimentData>();
  private readonly defaultConfig: BaseSentimentDataConfig = DEFAULT_CONFIG;

  constructor(@IChainDataService private readonly chainDataService: IChainDataService) {
    super();
  }

  private constructConfig(config?: Partial<BaseSentimentDataConfig>): BaseSentimentDataConfig {
    return {
      ...this.defaultConfig,
      ...config,
    };
  }

  public async get(symbol: string, config?: Partial<SentimentDataConfig>): Promise<ISentimentData> {
    if (!this.sentimentDataMap.has(symbol)) {
      const optionDataService = this.chainDataService.optionDataServices.get(symbol);
      if (!optionDataService) {
        throw new Error(`No option data found for symbol: ${symbol}`);
      }

      const finalConfig = this.constructConfig(config);
      const sentimentData = new SentimentData(optionDataService, finalConfig);
      await sentimentData.start();
      this.sentimentDataMap.set(symbol, sentimentData);
    }

    return this.sentimentDataMap.get(symbol)!;
  }

  public override dispose(): void {
    this.sentimentDataMap.forEach(data => data.dispose());
    this.sentimentDataMap.clear();
    super.dispose();
  }
}
