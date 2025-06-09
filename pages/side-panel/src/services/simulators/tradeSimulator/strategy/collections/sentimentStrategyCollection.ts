import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseStrategyConfig, IStrategy, StrategyType } from '../baseStrategy';
import { StrategyCollection } from '../strategyCollection';
import { SentimentStrategy } from '../strategies/sentimentStrategy';

/**
 * Configuration for Sentiment Strategy indicators
 */
export interface SentimentStrategyIndicatorConfig {
  period: number;
  volumeWeight?: number;
  expirationIndex: number;
  normalizeByATM?: boolean;
  numStrikes?: number;
  sentimentBeta?: number;
  sentimentMaxDeltaMatch?: number;
}

/**
 * Configuration specific to Sentiment Strategies
 */
export interface SentimentStrategyConfig extends BaseStrategyConfig {
  indicatorConfig: SentimentStrategyIndicatorConfig;
  confirmationTicks: number;
}

/**
 * Defines variations in sentiment strategy configurations for systematic testing.
 */
export interface SentimentStrategyVariation {
  period: number;
  volumeWeight: number;
  normalizeByATM?: boolean;
  confirmationTicks: number;
  extraConfig?: {
    numStrikes: number;
    sentimentBeta: number;
    sentimentMaxDeltaMatch: number;
  };
}

/**
 * Collection of Sentiment strategy configurations
 */
export class SentimentStrategyCollection extends StrategyCollection {
  private readonly variations: SentimentStrategyVariation[];
  private readonly symbols: readonly string[];
  private readonly expirationIndexes: number[];

  constructor(
    variations: SentimentStrategyVariation[] = [],
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

  public getConfigs(): SentimentStrategyConfig[] {
    const configs: SentimentStrategyConfig[] = [];

    for (const symbol of this.symbols) {
      for (const variation of this.variations) {
        for (const expirationIndex of this.expirationIndexes) {
          // Base config with all parameters including extraConfig
          const baseConfig: Omit<SentimentStrategyConfig, 'id' | 'type'> = {
            symbol,
            indicatorConfig: {
              period: variation.period,
              volumeWeight: variation.volumeWeight,
              expirationIndex,
              normalizeByATM: variation.normalizeByATM ?? true,
              ...(variation.extraConfig ?? {}), // Spread extraConfig parameters
            },
            confirmationTicks: variation.confirmationTicks,
          };

          // Create a descriptive suffix with all parameters
          const suffix = `P${variation.period}-VW${variation.volumeWeight.toFixed(2)}-E${expirationIndex}${
            variation.normalizeByATM === false ? '-NoNorm' : ''
          }${variation.extraConfig ? `-NS${variation.extraConfig.numStrikes}-SB${variation.extraConfig.sentimentBeta}-MDM${variation.extraConfig.sentimentMaxDeltaMatch}` : ''}`;

          configs.push({
            ...baseConfig,
            id: `SENTIMENT-${symbol}-TWOWAY-${suffix}`,
            type: StrategyType.TWO_WAY,
          });
        }
      }
    }

    return configs;
  }

  /**
   * Implementation of createStrategy for Sentiment strategies
   */
  protected createStrategy(config: BaseStrategyConfig): IStrategy | null {
    try {
      if (isSentimentStrategyConfig(config)) {
        return this.instantiationService.createInstance(SentimentStrategy, config);
      }

      console.warn(`SentimentStrategyCollection cannot handle config type: ${config.id}`);
      return null;
    } catch (error) {
      console.error(`Error creating sentiment strategy for config: ${config.id}`, error);
      return null;
    }
  }
}

/**
 * Generates all combinations (Cartesian product) of the given parameter arrays.
 */
export function generateStrategyVariations(
  periods: number[],
  volumeWeights: number[],
  normalizeOptions: boolean[] = [true],
  confirmationTicksOptions: number[] = [1],
): SentimentStrategyVariation[] {
  const variations: SentimentStrategyVariation[] = [];

  for (const period of periods) {
    for (const volumeWeight of volumeWeights) {
      for (const normalize of normalizeOptions) {
        for (const confirmationTicks of confirmationTicksOptions) {
          variations.push({
            period,
            volumeWeight,
            normalizeByATM: normalize,
            confirmationTicks,
          });
        }
      }
    }
  }

  return variations;
}

/**
 * Creates a default sentiment strategy collection with predefined parameters.
 SENTIMENT-QQQ-TWOWAY-P75-VW0.90-E0-NoNorm-NS4-SB0.5-MDM0.99
 SENTIMENT-QQQ-TWOWAY-P15-VW0.90-E0-NoNorm-NS8-SB0.3-MDM0.9
 SENTIMENT-QQQ-TWOWAY-P15-VW0.85-E0-NoNorm-NS7-SB0.3-MDM0.85
 SENTIMENT-QQQ-TWOWAY-P10-VW0.85-E0-NoNorm-NS6-SB0.2-MDM0.85

*/
export function createDefaultSentimentCollection(
  instantiationService: IInstantiationService,
): SentimentStrategyCollection {
  // Define representative values for each parameter
  const numStrikesList = [5, 8, 13];
  const periods = [10, 15];
  const sentimentBetas = [0.2, 0.4];
  const sentimentMaxDeltaMatches = [0.85, 0.9];
  const volumeWeights = [0.85, 0.9];
  const normalizeByATMOptions = [false];
  const confirmationTicksOptions = [3, 4, 5]; // New hyperparameter for confirmation ticks

  // Generate all combinations
  const variations: SentimentStrategyVariation[] = [];
  for (const numStrikes of numStrikesList) {
    for (const period of periods) {
      for (const sentimentBeta of sentimentBetas) {
        for (const sentimentMaxDeltaMatch of sentimentMaxDeltaMatches) {
          for (const volumeWeight of volumeWeights) {
            for (const normalizeByATM of normalizeByATMOptions) {
              for (const confirmationTicks of confirmationTicksOptions) {
                // Add confirmationTicks as a hyperparameter
                variations.push({
                  period,
                  volumeWeight,
                  normalizeByATM,
                  confirmationTicks,
                  extraConfig: {
                    numStrikes,
                    sentimentBeta,
                    sentimentMaxDeltaMatch,
                  },
                });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${variations.length} Sentiment Strategy Variations`);

  return new SentimentStrategyCollection(
    variations,
    ['QQQ'], // Default symbol
    [0], // Default expiration index
    instantiationService,
  );
}

/**
 * Type guard to check if a config is a SentimentStrategyConfig
 */
export function isSentimentStrategyConfig(
  config: BaseStrategyConfig,
): config is SentimentStrategyConfig {
  return (
    'indicatorConfig' in config && 'period' in (config as SentimentStrategyConfig).indicatorConfig
  );
}
