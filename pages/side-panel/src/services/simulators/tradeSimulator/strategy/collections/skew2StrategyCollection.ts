// Collection boilerplate template
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseStrategyConfig, IStrategy, StrategyType } from '../baseStrategy';
import { StrategyCollection } from '../strategyCollection';
import { Skew2Strategy } from '../strategies/skew2Strategy';

export interface Skew2StrategyIndicatorConfig {
  period: number;
  expirationIndex: number;
  numStrikes?: number;
  sentimentMaxDeltaMatch?: number; // mapped from maxDelta
  volumeWeight?: number;
  normalizeByATM?: boolean;
  sentimentBeta?: number;
  lowerBound?: number; // Add lower bound for delta filtering
  upperBound?: number; // Add upper bound for delta filtering
  consecutiveCloseSignals?: number; // New hyperparameter
  totalDifferenceThreshold?: number; // New hyperparameter for totalDifference
}

export interface Skew2StrategyConfig extends BaseStrategyConfig {
  indicatorConfig: Skew2StrategyIndicatorConfig;
}

export function isSkew2StrategyConfig(config: BaseStrategyConfig): config is Skew2StrategyConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    'indicatorConfig' in config &&
    typeof (config as { indicatorConfig: unknown }).indicatorConfig === 'object' &&
    (config as { indicatorConfig: { period: unknown; expirationIndex: unknown } })
      .indicatorConfig !== null &&
    typeof (config as { indicatorConfig: { period: unknown } }).indicatorConfig.period ===
      'number' &&
    typeof (config as { indicatorConfig: { expirationIndex: unknown } }).indicatorConfig
      .expirationIndex === 'number'
  );
}

export interface Skew2StrategyVariation {
  period: number;
  expirationIndex: number;
  numStrikes?: number;
  maxDelta?: number; // will be mapped to sentimentMaxDeltaMatch
  volumeWeight?: number;
  normalizeByATM?: boolean;
  sentimentBeta?: number;
  lowerBound?: number; // Add lower bound for delta filtering
  upperBound?: number; // Add upper bound for delta filtering
  consecutiveCloseSignals?: number; // New hyperparameter
  totalDifferenceThreshold?: number; // New hyperparameter for totalDifference
}

export class Skew2StrategyCollection extends StrategyCollection {
  private readonly variations: Skew2StrategyVariation[];
  private readonly symbols: readonly string[];
  private readonly expirationIndexes: number[];

  constructor(
    variations: Skew2StrategyVariation[] = [],
    symbols: readonly string[] = ['SPY'],
    expirationIndexes: number[] = [0], // Note: This class member seems unused in getConfigs, consider if it's needed or how it should integrate.
    @IInstantiationService instantiationService: IInstantiationService,
  ) {
    super(instantiationService);
    this.variations = variations;
    this.symbols = symbols;
    this.expirationIndexes = expirationIndexes; // This is captured but not used in getConfigs.
  }

  protected loadConfigurations(): void {
    this.strategyConfigs = this.getConfigs();
  }

  public getConfigs(): Skew2StrategyConfig[] {
    const configs: Skew2StrategyConfig[] = [];
    const strategyTypes = [
      StrategyType.LONG,
      StrategyType.SHORT,
      // StrategyType.TWO_WAY,
    ];

    // Determine which parameters have more than one option to include in the ID
    const paramOptions = {
      period: Array.from(new Set(this.variations.map(v => v.period))).filter(v => v !== undefined),
      expirationIndex: Array.from(new Set(this.variations.map(v => v.expirationIndex))).filter(
        v => v !== undefined,
      ),
      numStrikes: Array.from(new Set(this.variations.map(v => v.numStrikes))).filter(
        v => v !== undefined,
      ),
      maxDelta: Array.from(new Set(this.variations.map(v => v.maxDelta))).filter(
        v => v !== undefined,
      ),
      volumeWeight: Array.from(new Set(this.variations.map(v => v.volumeWeight))).filter(
        v => v !== undefined,
      ),
      normalizeByATM: Array.from(new Set(this.variations.map(v => v.normalizeByATM))).filter(
        v => v !== undefined,
      ),
      sentimentBeta: Array.from(new Set(this.variations.map(v => v.sentimentBeta))).filter(
        v => v !== undefined,
      ),
      lowerBound: Array.from(new Set(this.variations.map(v => v.lowerBound))).filter(
        v => v !== undefined,
      ),
      upperBound: Array.from(new Set(this.variations.map(v => v.upperBound))).filter(
        v => v !== undefined,
      ),
      consecutiveCloseSignals: Array.from(
        new Set(this.variations.map(v => v.consecutiveCloseSignals)),
      ).filter(v => v !== undefined), // New
      totalDifferenceThreshold: Array.from(
        new Set(this.variations.map(v => v.totalDifferenceThreshold)),
      ).filter(v => v !== undefined), // New
    };

    for (const symbol of this.symbols) {
      for (const variation of this.variations) {
        const baseConfig: Omit<Skew2StrategyConfig, 'id' | 'type'> = {
          symbol,
          indicatorConfig: {
            period: variation.period,
            expirationIndex: variation.expirationIndex,
            numStrikes: variation.numStrikes,
            sentimentMaxDeltaMatch: variation.maxDelta,
            volumeWeight: variation.volumeWeight,
            normalizeByATM: variation.normalizeByATM,
            sentimentBeta: variation.sentimentBeta,
            lowerBound: variation.lowerBound,
            upperBound: variation.upperBound,
            consecutiveCloseSignals: variation.consecutiveCloseSignals, // New
            totalDifferenceThreshold: variation.totalDifferenceThreshold, // New
          },
        };

        const suffixParts: string[] = [];
        if (paramOptions.period.length > 1) suffixParts.push(`P${variation.period}`);
        // Note: The original class has this.expirationIndexes, but the variation also has expirationIndex.
        // Assuming variation.expirationIndex is the one to use for ID generation based on skewStrategyCollection.
        if (paramOptions.expirationIndex.length > 1)
          suffixParts.push(`E${variation.expirationIndex}`);
        if (paramOptions.numStrikes.length > 1 && variation.numStrikes !== undefined)
          suffixParts.push(`NS${variation.numStrikes}`);
        if (paramOptions.maxDelta.length > 1 && variation.maxDelta !== undefined)
          suffixParts.push(`MD${variation.maxDelta.toFixed(2)}`);
        if (paramOptions.volumeWeight.length > 1 && variation.volumeWeight !== undefined)
          suffixParts.push(`VW${variation.volumeWeight.toFixed(2)}`);
        if (paramOptions.normalizeByATM.length > 1 && variation.normalizeByATM === false)
          suffixParts.push('NoNorm'); // Only show if false and multiple options
        if (paramOptions.sentimentBeta.length > 1 && variation.sentimentBeta !== undefined)
          suffixParts.push(`SB${variation.sentimentBeta.toFixed(2)}`);
        if (paramOptions.lowerBound.length > 1 && variation.lowerBound !== undefined)
          suffixParts.push(`LB${variation.lowerBound}`);
        if (paramOptions.upperBound.length > 1 && variation.upperBound !== undefined)
          suffixParts.push(`UB${variation.upperBound}`);
        if (
          paramOptions.consecutiveCloseSignals.length > 1 &&
          variation.consecutiveCloseSignals !== undefined
        )
          // New
          suffixParts.push(`CCS${variation.consecutiveCloseSignals}`); // New
        if (
          paramOptions.totalDifferenceThreshold.length > 1 &&
          variation.totalDifferenceThreshold !== undefined
        )
          // New
          suffixParts.push(`TDT${variation.totalDifferenceThreshold.toFixed(4)}`); // New

        const suffix = suffixParts.length > 0 ? `-${suffixParts.join('-')}` : '';

        for (const type of strategyTypes) {
          configs.push({
            ...baseConfig,
            id: `SKEW2-${symbol}-${type}${suffix}`,
            type,
          });
        }
      }
    }
    return configs;
  }

  protected createStrategy(config: BaseStrategyConfig): IStrategy | null {
    if (isSkew2StrategyConfig(config)) {
      return this.instantiationService.createInstance(Skew2Strategy, config);
    }
    return null;
  }
}

export function createDefaultSkew2Collection(
  instantiationService: IInstantiationService,
): Skew2StrategyCollection {
  // Define hyperparameter arrays
  const periods = [30];
  const expirationIndexes = [0, 1];
  const numStrikesList = [40];
  const maxDeltas = [0.8];
  const volumeWeights = [0.1];
  const normalizeByATMList = [false];
  const sentimentBetas = [0.2];
  const lowerBounds = [10, 20, 35, 40, 50, 55]; // Add lower bound values here
  const upperBounds = [45, 50, 60, 75, 80, 90]; // Add upper bound values here
  const consecutiveCloseSignalThresholds = [4]; // New hyperparameter values
  const totalDifferenceThresholds = [0.03, 0.04]; // New hyperparameter values

  const variations: Skew2StrategyVariation[] = [];
  for (const period of periods) {
    for (const expirationIndex of expirationIndexes) {
      for (const numStrikes of numStrikesList) {
        for (const maxDelta of maxDeltas) {
          for (const volumeWeight of volumeWeights) {
            for (const normalizeByATM of normalizeByATMList) {
              for (const sentimentBeta of sentimentBetas) {
                for (const lowerBound of lowerBounds) {
                  for (const upperBound of upperBounds) {
                    for (const consecutiveCloseSignals of consecutiveCloseSignalThresholds) {
                      for (const totalDifferenceThreshold of totalDifferenceThresholds) {
                        // Iterate over new hyperparameter
                        if (lowerBound < upperBound) {
                          variations.push({
                            period,
                            expirationIndex,
                            numStrikes,
                            maxDelta,
                            volumeWeight,
                            normalizeByATM,
                            sentimentBeta,
                            lowerBound,
                            upperBound,
                            consecutiveCloseSignals, // Add to variation
                            totalDifferenceThreshold, // Add to variation
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  const symbols = ['QQQ'];
  return new Skew2StrategyCollection(variations, symbols, [], instantiationService);
}
