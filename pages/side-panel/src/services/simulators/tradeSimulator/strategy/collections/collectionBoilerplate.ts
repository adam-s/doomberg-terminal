// Collection boilerplate template
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseStrategyConfig, IStrategy, StrategyType } from '../baseStrategy';
import { StrategyCollection } from '../strategyCollection';

export interface ExampleStrategyIndicatorConfig {
  period?: number;
  expirationIndex?: number;
}

export interface ExampleStrategyConfig extends BaseStrategyConfig {
  indicatorConfig: ExampleStrategyIndicatorConfig;
}

export interface ExampleStrategyVariation {
  period: number;
}

export class ExampleStrategyCollection extends StrategyCollection {
  private readonly variations: ExampleStrategyVariation[];
  private readonly symbols: readonly string[];
  private readonly expirationIndexes: number[];

  constructor(
    variations: ExampleStrategyVariation[] = [],
    symbols: readonly string[] = ['SPY'],
    expirationIndexes: number[] = [0],
    @IInstantiationService instantiationService: IInstantiationService,
  ) {
    super(instantiationService);
    this.variations = variations;
    this.symbols = symbols;
    this.expirationIndexes = expirationIndexes;
  }

  protected loadConfigurations(): void {
    this.strategyConfigs = this.getConfigs();
  }

  public getConfigs(): ExampleStrategyConfig[] {
    const configs: ExampleStrategyConfig[] = [];
    const strategyTypes = [StrategyType.LONG, StrategyType.SHORT];
    for (const symbol of this.symbols) {
      for (const variation of this.variations) {
        for (const expirationIndex of this.expirationIndexes) {
          const baseConfig: Omit<ExampleStrategyConfig, 'id' | 'type'> = {
            symbol,
            indicatorConfig: {
              period: variation.period,
              expirationIndex,
            },
          };
          for (const type of strategyTypes) {
            configs.push({
              ...baseConfig,
              id: `EXAMPLE-${symbol}-${type}-P${variation.period}-E${expirationIndex}`,
              type,
            });
          }
        }
      }
    }
    return configs;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected createStrategy(config: BaseStrategyConfig): IStrategy | null {
    // Implement instantiation logic for your strategy here
    return null;
  }
}
