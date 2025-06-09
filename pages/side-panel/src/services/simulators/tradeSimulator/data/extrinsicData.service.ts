import { IChainDataService } from './chainData.service';
import {
  ExtrinsicValueFlowsData,
  IExtrinsicValueFlowsData,
  ExtrinsicValueFlowsConfig,
  BaseExtrinsicValueFlowsConfig,
} from '@src/services/extrinsicValue/extrinsicValueFlowsData.service';
import { IComputationService } from '@src/side-panel/worker/computation/computationService';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtrinsicDataService = createDecorator<IExtrinsicDataService>('chainDataService');

export interface IExtrinsicDataService {
  readonly _serviceBrand: undefined;
  get: (
    symbol: string,
    config?: Partial<ExtrinsicValueFlowsConfig>,
  ) => Promise<IExtrinsicValueFlowsData>;
  dispose(): void;
}

export class ExtrinsicDataService extends Disposable implements IExtrinsicDataService {
  declare readonly _serviceBrand: undefined;

  private extrinsicValueFlowsDataMap = new Map<string, IExtrinsicValueFlowsData>();

  private readonly defaultConfig: BaseExtrinsicValueFlowsConfig = {
    maxHistorySize: 500,
    movingAveragePeriod: 6,
    historicalTotalsSize: 60,
    tradePriceSize: 15,
  };

  constructor(
    @IChainDataService private readonly chainDataService: IChainDataService,
    @IComputationService private readonly _computationService: IComputationService,
  ) {
    super();
  }

  private constructConfig(
    config?: Partial<BaseExtrinsicValueFlowsConfig>,
  ): BaseExtrinsicValueFlowsConfig {
    return {
      ...this.defaultConfig,
      ...config,
    };
  }

  private parseConfigString(configString?: string): Partial<ExtrinsicValueFlowsConfig> {
    if (!configString) {
      return {};
    }
    const [maxHistory, movingAvg, historicalTotals] = configString.split(':');
    const config: Partial<ExtrinsicValueFlowsConfig> = {};

    if (maxHistory) config.maxHistorySize = parseInt(maxHistory);
    if (movingAvg) config.movingAveragePeriod = parseInt(movingAvg);
    if (historicalTotals) config.historicalTotalsSize = parseInt(historicalTotals);

    return config;
  }

  async get(
    symbol: string,
    config?: Partial<ExtrinsicValueFlowsConfig>,
  ): Promise<IExtrinsicValueFlowsData> {
    if (!this.extrinsicValueFlowsDataMap.has(symbol)) {
      const optionData = this.chainDataService.optionDataServices.get(symbol);

      if (!optionData) {
        throw new Error(`No option data found for symbol: ${symbol}`);
      }

      const finalConfig = this.constructConfig(config);
      const flowsData = new ExtrinsicValueFlowsData(
        optionData,
        this._computationService,
        finalConfig,
      );
      await flowsData.start();
      this.extrinsicValueFlowsDataMap.set(symbol, flowsData);
    }

    return this.extrinsicValueFlowsDataMap.get(symbol)!;
  }

  async getFromString(symbolConfig: string): Promise<IExtrinsicValueFlowsData> {
    const [symbol, ...configParts] = symbolConfig.split(':');
    const config = this.parseConfigString(configParts.join(':'));
    return this.get(symbol, config);
  }
}
