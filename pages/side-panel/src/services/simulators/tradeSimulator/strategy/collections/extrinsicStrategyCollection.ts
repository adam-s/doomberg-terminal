import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseStrategyConfig, IStrategy, StrategyType } from '../baseStrategy';
import { StrategyCollection } from '../strategyCollection';
import { ExtrinsicStrategy } from '../strategies/extrinsicDouble';

/**
 * Update CumulativeOption type to include new periods
 */
export type CumulativeOption = 'ALL' | '5' | '8' | '10' | '20' | '30' | '40' | '50';

/**
 * Configuration for Extrinsic Strategy indicators
 */
export interface ExtrinsicStrategyIndicatorConfig {
  movingAveragePeriod: number;
  putDiscountFactor?: number;
  tradePriceSize: number;
  areaSize: number;
  cumulative?: CumulativeOption;
  spyFactor?: number; // Parameter to multiply SPY cumulative value
  // Trend detection parameters
  maPeriod?: number; // Period for calculating normalized moving averages
  spyFactorWhenHigher?: number; // SPY factor to use when SPY MA is higher than QQQ MA
  spyFactorWhenLower?: number; // SPY factor to use when SPY MA is lower than QQQ MA
  /** Absolute price drop in cents over 2 ticks to trigger exit for long positions */
  twoTickDropThresholdCents?: number;
  /** Number of ticks to wait before entering a new trade after a losing trade */
  cooldownTicksAfterLoss?: number;
  /** Minimum flow threshold for trade entry/exit */
  minFlowThreshold?: number;
}

/**
 * Configuration specific to Extrinsic Strategies
 */
export interface ExtrinsicStrategyConfig extends BaseStrategyConfig {
  trigger: number;
  indicatorConfig: ExtrinsicStrategyIndicatorConfig;
}

/**
 * General strategy configuration union type
 */
export type StrategyConfig = BaseStrategyConfig | ExtrinsicStrategyConfig;

/**
 * Interface for a collection of strategies
 */
export interface IStrategyCollection<T extends StrategyConfig = StrategyConfig> {
  /**
   * Get all strategy configurations from this collection
   */
  getConfigs(): T[];
}

/**
 * Defines variations in strategy configurations for systematic testing.
 */
export interface StrategyVariation {
  movingAveragePeriod: number;
  cumulative: CumulativeOption;
  spyFactor: number;
  maPeriod?: number;
  spyFactorWhenHigher?: number;
  spyFactorWhenLower?: number;
  twoTickDropThresholdCents?: number;
  cooldownTicksAfterLoss?: number;
  minFlowThreshold?: number; // Add minFlowThreshold
}

/**
 * Collection of Extrinsic strategy configurations
 */
export class ExtrinsicStrategyCollection
  extends StrategyCollection
  implements IStrategyCollection<ExtrinsicStrategyConfig>
{
  private readonly variations: StrategyVariation[];
  private readonly symbols: readonly string[];
  private readonly dateIndexes: number[];

  constructor(
    variations: StrategyVariation[] = [],
    symbols: readonly string[] = ['QQQ', 'SPY'],
    dateIndexes: number[] = [0],
    @IInstantiationService instantiationService: IInstantiationService,
  ) {
    super(instantiationService);
    this.variations = variations;
    this.symbols = symbols;
    this.dateIndexes = dateIndexes;
  }

  protected loadConfigurations(): void {
    this.strategyConfigs = this.getConfigs();
  }

  public getConfigs(): ExtrinsicStrategyConfig[] {
    const configs: ExtrinsicStrategyConfig[] = [];

    for (const symbol of this.symbols) {
      for (const {
        movingAveragePeriod,
        cumulative,
        spyFactor,
        maPeriod,
        spyFactorWhenHigher,
        spyFactorWhenLower,
        twoTickDropThresholdCents,
        cooldownTicksAfterLoss,
        minFlowThreshold, // Destructure minFlowThreshold
      } of this.variations) {
        for (const trigger of this.dateIndexes) {
          const baseConfig: Omit<ExtrinsicStrategyConfig, 'id' | 'type'> = {
            symbol,
            trigger,
            indicatorConfig: {
              movingAveragePeriod,
              tradePriceSize: 15,
              areaSize: 15,
              cumulative,
              spyFactor,
              maPeriod,
              spyFactorWhenHigher,
              spyFactorWhenLower,
              twoTickDropThresholdCents,
              cooldownTicksAfterLoss,
              minFlowThreshold, // Pass minFlowThreshold to indicatorConfig
            },
          };
          const suffixParts = [
            `MA${movingAveragePeriod}`,
            `CUM${cumulative}`,
            `SF${spyFactor.toFixed(1)}`,
            `MAP${maPeriod}`,
            `SFH${spyFactorWhenHigher?.toFixed(1) || '0.5'}`, // Use default if undefined
            `SFL${spyFactorWhenLower?.toFixed(1) || '1.2'}`, // Use default if undefined
            `T${trigger}`,
          ];
          if (twoTickDropThresholdCents !== undefined) {
            suffixParts.push(`TTD${twoTickDropThresholdCents.toFixed(2)}`);
          }
          if (cooldownTicksAfterLoss !== undefined) {
            suffixParts.push(`CD${cooldownTicksAfterLoss}`);
          }
          if (minFlowThreshold !== undefined) {
            // Add minFlowThreshold to suffix if defined
            suffixParts.push(`MFT${minFlowThreshold.toFixed(1)}`);
          }
          const suffix = suffixParts.join('-');
          configs.push({
            ...baseConfig,
            id: `EXTRINSIC-${symbol}-TWOWAY-${suffix}`,
            type: StrategyType.TWO_WAY,
          });
        }
      }
    }

    return configs;
  }

  /**
   * Implementation of createStrategy for Extrinsic strategies
   */
  protected createStrategy(config: StrategyConfig): IStrategy | null {
    try {
      if (isExtrinsicStrategyConfig(config)) {
        return this.instantiationService.createInstance(ExtrinsicStrategy, config);
      }

      console.warn(`ExtrinsicStrategyCollection cannot handle config type: ${config.id}`);
      return null;
    } catch (error) {
      console.error(`Error creating extrinsic strategy for config: ${config.id}`, error);
      return null;
    }
  }
}

/**
 * Generates all combinations (Cartesian product) of the given parameter arrays.
 */
export function generateStrategyVariations(
  movingAveragePeriods: number[],
  cumulativeOptions: CumulativeOption[],
  spyFactors: number[] = [1.0],
  maPeriods: number[] = [50],
  spyFactorsWhenHigher: number[] = [0.5],
  spyFactorsWhenLower: number[] = [1.2],
  twoTickDropThresholdCentsOptions: (number | undefined)[] = [undefined],
  cooldownTicksOptions: (number | undefined)[] = [5],
  minFlowThresholdOptions: (number | undefined)[] = [200], // Add minFlowThresholdOptions parameter
): StrategyVariation[] {
  const variations: StrategyVariation[] = [];
  for (const ma of movingAveragePeriods) {
    for (const c of cumulativeOptions) {
      for (const sf of spyFactors) {
        for (const maPeriod of maPeriods) {
          for (const spyFactorHigher of spyFactorsWhenHigher) {
            for (const spyFactorLower of spyFactorsWhenLower) {
              for (const twoTickDrop of twoTickDropThresholdCentsOptions) {
                for (const cooldownTicksAfterLoss of cooldownTicksOptions) {
                  for (const minFlowThreshold of minFlowThresholdOptions) {
                    // Iterate over minFlowThresholdOptions
                    variations.push({
                      movingAveragePeriod: ma,
                      cumulative: c,
                      spyFactor: sf,
                      maPeriod,
                      spyFactorWhenHigher: spyFactorHigher,
                      spyFactorWhenLower: spyFactorLower,
                      twoTickDropThresholdCents: twoTickDrop,
                      cooldownTicksAfterLoss,
                      minFlowThreshold, // Add minFlowThreshold to variation object
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
  return variations;
}

// Default parameters for strategy variations
const movingAverage = [40, 60]; // 5 values
const cumulative: CumulativeOption[] = ['8', '10', '30', '40', '50']; // 2 values
const spyFactors = [0.1];
const maPeriods = [15, 20, 40, 60];
const spyFactorsWhenHigher = [0.9];
const spyFactorsWhenLower = [0.1];
const twoTickDropThresholdCentsOptions: (number | undefined)[] = [0.1, 0.15];
const cooldownTicksOptions: (number | undefined)[] = [20];
const minFlowThresholdOptions: (number | undefined)[] = [50, 200]; // Define default min flow thresholds

/**
 * Default extrinsic strategy collection factory function
 */
export function createDefaultExtrinsicCollection(
  instantiationService: IInstantiationService,
): ExtrinsicStrategyCollection {
  const variations = generateStrategyVariations(
    movingAverage,
    cumulative,
    spyFactors,
    maPeriods,
    spyFactorsWhenHigher,
    spyFactorsWhenLower,
    twoTickDropThresholdCentsOptions,
    cooldownTicksOptions,
    minFlowThresholdOptions, // Pass minFlowThresholdOptions
  );
  console.log(`Generated ${variations.length} Extrinsic Strategy Variations`);
  return new ExtrinsicStrategyCollection(variations, ['QQQ'], [0], instantiationService);
}

/**
 * Type guard to check if a config is an ExtrinsicStrategyConfig
 */
export function isExtrinsicStrategyConfig(
  config: StrategyConfig,
): config is ExtrinsicStrategyConfig {
  return 'trigger' in config && 'indicatorConfig' in config;
}
