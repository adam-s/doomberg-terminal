import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDataService } from '@src/services/data.service';
import { autorun } from 'vs/base/common/observable';
import { OptionDataService } from '@src/services/chains/optionData.service';

export const IChainDataService = createDecorator<IChainDataService>('chainDataService');

export interface IChainDataService {
  readonly _serviceBrand: undefined;
  optionDataServices: Map<string, OptionDataService>;
  dispose(): void;
}

export class ChainDataService extends Disposable implements IChainDataService {
  declare readonly _serviceBrand: undefined;

  // private dataService!: IDataService;
  public optionDataServices = new Map<string, OptionDataService>();
  private readonly defaultSymbols = ['QQQ', 'SPY'];

  constructor(@IDataService private readonly dataService: IDataService) {
    super();
    this.dataService.optionsChainsService.setSymbols(this.defaultSymbols);
    autorun(reader => {
      const optionDataServices = this.dataService.optionsChainsService.chains$.read(reader);
      optionDataServices.forEach(optionDataService => {
        const symbol = optionDataService.symbol;
        if (!this.optionDataServices.has(symbol)) {
          this.optionDataServices.set(symbol, optionDataService);
        }
      });
    });
  }
}
