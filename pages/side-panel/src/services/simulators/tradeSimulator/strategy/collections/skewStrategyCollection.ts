import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BaseStrategyConfig, IStrategy, StrategyType } from '../baseStrategy';
import { StrategyCollection } from '../strategyCollection';
import { VolatilitySkewStrategy } from '../strategies/skewStrategy';

/**
 * Weighting methods for volatility skew calculation
 */
export enum SkewWeightMethod {
  /** Equal weight for all option pairs */
  EQUAL = 'equal',
  /** Weight by liquidity (volume/open interest) */
  LIQUIDITY = 'liquidity',
  /** Weight by nearness to ATM (delta closer to 0.5) */
  ATM_PROXIMITY = 'atm_proximity',
}

// First, add StrikeSelectionMode enum to match the one in sentimentData.ts
export enum StrikeSelectionMode {
  ITM = 'itm',
  OTM = 'otm',
  BOTH = 'both',
}

/**
 * Configuration for Skew Strategy indicators
 */
export interface SkewStrategyIndicatorConfig {
  /** Period for SMA calculations */
  period: number;
  /** Weight for volume in liquidity calculations (0-1) */
  volumeWeight?: number;
  /** Which expiration to use (0 = nearest, 1 = next, etc.) */
  expirationIndex: number;
  /** Whether to normalize IV by ATM IV */
  normalizeByATM?: boolean;
  /** Number of strikes to include on each side of ATM */
  numStrikes?: number;
  /** Method to weight options in skew calculation */
  skewWeightMethod?: SkewWeightMethod;
  /** Only include options with absolute delta less than this value (0-1) */
  maxDelta?: number;
  /** Only include options with absolute delta greater than this value (0-1) */
  minDelta?: number;
  /** Number of samples to use for smoothing the skew percentage */
  smoothingPeriod?: number;
  /** Minimum change required to generate a signal (reduces noise) */
  changeThreshold?: number;
  /** Max price cents for long entry (e.g., 0.10 means price must be x.00 to x.10) */
  entryLongCentsMax?: number;
  /** Min price cents for short entry (e.g., 0.90 means price must be x.90 to x.99) */
  entryShortCentsMin?: number;
  /** Price cents ceiling to exit long position (e.g., 0.60 means exit if price >= x.60) */
  exitLongCentsCeiling?: number;
  /** Price cents floor to exit short position (e.g., 0.40 means exit if price <= x.40) */
  exitShortCentsFloor?: number;
  /** Number of ticks to wait before entering a new trade after a losing trade */
  cooldownTicksAfterLoss?: number;
  /** Absolute price drop in cents over 2 ticks to trigger exit for long positions */
  twoTickDropThresholdCents?: number;
  /** Number of consecutive signals required to enter a position */
  requiredConsecutiveSignalsForEntry?: number;
  /** Minimum number of ticks to hold a position */
  minPositionHoldTicks?: number;
  /** Mode for strike selection (ITM, OTM, or both) */
  strikeSelectionMode?: StrikeSelectionMode;
}

/**
 * Configuration specific to Skew Strategies
 */
export interface SkewStrategyConfig extends BaseStrategyConfig {
  indicatorConfig: SkewStrategyIndicatorConfig;
}

/**
 * Defines variations in sentiment strategy configurations for systematic testing.
 */
export interface SkewStrategyVariation {
  period: number;
  volumeWeight: number;
  normalizeByATM?: boolean;
  skewWeightMethod?: SkewWeightMethod;
  maxDelta?: number;
  minDelta?: number;
  smoothingPeriod?: number;
  changeThreshold?: number;
  numStrikes?: number;
  entryLongCentsMax?: number;
  entryShortCentsMin?: number;
  exitLongCentsCeiling?: number;
  exitShortCentsFloor?: number;
  /** Number of ticks to wait before entering a new trade after a losing trade */
  cooldownTicksAfterLoss?: number;
  /** Absolute price drop in cents over 2 ticks to trigger exit for long positions */
  twoTickDropThresholdCents?: number;
  /** Number of consecutive signals required to enter a position */
  requiredConsecutiveSignalsForEntry?: number;
  /** Minimum number of ticks to hold a position */
  minPositionHoldTicks: number;
  /** Mode for strike selection (ITM, OTM, or both) */
  strikeSelectionMode?: StrikeSelectionMode;
}

/**
 * Collection of Skew strategy configurations
 */
export class SkewStrategyCollection extends StrategyCollection {
  private readonly variations: SkewStrategyVariation[];
  private readonly symbols: readonly string[];
  private readonly expirationIndexes: number[];

  constructor(
    variations: SkewStrategyVariation[] = [],
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

  public getConfigs(): SkewStrategyConfig[] {
    const configs: SkewStrategyConfig[] = [];
    const strategyTypes = [StrategyType.LONG, StrategyType.SHORT];

    // Determine which parameters have more than one option
    const paramOptions = {
      period: Array.from(new Set(this.variations.map(v => v.period))).filter(v => v !== undefined),
      volumeWeight: Array.from(new Set(this.variations.map(v => v.volumeWeight))).filter(
        v => v !== undefined,
      ),
      normalizeByATM: Array.from(new Set(this.variations.map(v => v.normalizeByATM))).filter(
        v => v !== undefined,
      ),
      skewWeightMethod: Array.from(new Set(this.variations.map(v => v.skewWeightMethod))).filter(
        v => v !== undefined,
      ),
      maxDelta: Array.from(new Set(this.variations.map(v => v.maxDelta))).filter(
        v => v !== undefined,
      ),
      minDelta: Array.from(new Set(this.variations.map(v => v.minDelta))).filter(
        v => v !== undefined,
      ),
      smoothingPeriod: Array.from(new Set(this.variations.map(v => v.smoothingPeriod))).filter(
        v => v !== undefined,
      ),
      changeThreshold: Array.from(new Set(this.variations.map(v => v.changeThreshold))).filter(
        v => v !== undefined,
      ),
      numStrikes: Array.from(new Set(this.variations.map(v => v.numStrikes))).filter(
        v => v !== undefined,
      ),
      entryLongCentsMax: Array.from(new Set(this.variations.map(v => v.entryLongCentsMax))).filter(
        v => v !== undefined,
      ),
      entryShortCentsMin: Array.from(
        new Set(this.variations.map(v => v.entryShortCentsMin)),
      ).filter(v => v !== undefined),
      exitLongCentsCeiling: Array.from(
        new Set(this.variations.map(v => v.exitLongCentsCeiling)),
      ).filter(v => v !== undefined),
      exitShortCentsFloor: Array.from(
        new Set(this.variations.map(v => v.exitShortCentsFloor)),
      ).filter(v => v !== undefined),
      cooldownTicksAfterLoss: Array.from(
        new Set(this.variations.map(v => v.cooldownTicksAfterLoss)),
      ).filter(v => v !== undefined),
      twoTickDropThresholdCents: Array.from(
        new Set(this.variations.map(v => v.twoTickDropThresholdCents)),
      ).filter(v => v !== undefined),
      requiredConsecutiveSignalsForEntry: Array.from(
        new Set(this.variations.map(v => v.requiredConsecutiveSignalsForEntry)),
      ).filter(v => v !== undefined),
      minPositionHoldTicks: Array.from(
        new Set(this.variations.map(v => v.minPositionHoldTicks)),
      ).filter(v => v !== undefined),
    };

    for (const symbol of this.symbols) {
      for (const variation of this.variations) {
        for (const expirationIndex of this.expirationIndexes) {
          // Base config with all parameters
          const baseConfig: Omit<SkewStrategyConfig, 'id' | 'type'> = {
            symbol,
            indicatorConfig: {
              period: variation.period,
              volumeWeight: variation.volumeWeight,
              expirationIndex,
              normalizeByATM: variation.normalizeByATM ?? true,
              skewWeightMethod: variation.skewWeightMethod,
              maxDelta: variation.maxDelta,
              minDelta: variation.minDelta,
              smoothingPeriod: variation.smoothingPeriod,
              changeThreshold: variation.changeThreshold,
              numStrikes: variation.numStrikes,
              entryLongCentsMax: variation.entryLongCentsMax,
              entryShortCentsMin: variation.entryShortCentsMin,
              exitLongCentsCeiling: variation.exitLongCentsCeiling,
              exitShortCentsFloor: variation.exitShortCentsFloor,
              cooldownTicksAfterLoss: variation.cooldownTicksAfterLoss,
              twoTickDropThresholdCents: variation.twoTickDropThresholdCents,
              requiredConsecutiveSignalsForEntry: variation.requiredConsecutiveSignalsForEntry,
              minPositionHoldTicks: variation.minPositionHoldTicks,
              strikeSelectionMode: variation.strikeSelectionMode,
            },
          };

          // Only include in suffix if more than one option exists for that parameter
          const suffixParts: string[] = [];
          if (paramOptions.period.length > 1) suffixParts.push(`P${variation.period}`);
          if (paramOptions.volumeWeight.length > 1)
            suffixParts.push(`VW${variation.volumeWeight.toFixed(2)}`);
          if (this.expirationIndexes.length > 1) suffixParts.push(`E${expirationIndex}`);
          if (paramOptions.normalizeByATM.length > 1 && variation.normalizeByATM === false)
            suffixParts.push('NoNorm');
          if (paramOptions.skewWeightMethod.length > 1 && variation.skewWeightMethod)
            suffixParts.push(`WM${variation.skewWeightMethod}`);
          if (paramOptions.maxDelta.length > 1 && variation.maxDelta !== undefined)
            suffixParts.push(`MD${variation.maxDelta}`);
          if (paramOptions.minDelta.length > 1 && variation.minDelta !== undefined)
            suffixParts.push(`MND${variation.minDelta}`);
          if (paramOptions.smoothingPeriod.length > 1 && variation.smoothingPeriod)
            suffixParts.push(`SP${variation.smoothingPeriod}`);
          if (paramOptions.changeThreshold.length > 1 && variation.changeThreshold)
            suffixParts.push(`CT${variation.changeThreshold}`);
          if (paramOptions.numStrikes.length > 1 && variation.numStrikes)
            suffixParts.push(`NS${variation.numStrikes}`);
          if (
            paramOptions.cooldownTicksAfterLoss.length > 1 &&
            variation.cooldownTicksAfterLoss !== undefined
          )
            suffixParts.push(`CD${variation.cooldownTicksAfterLoss}`);
          // Always show the numeric ELC<value> or ELCU, regardless of number of distinct values
          if (variation.entryLongCentsMax !== undefined) {
            suffixParts.push(`ELC${variation.entryLongCentsMax.toFixed(2)}`);
          } else {
            // suffixParts.push('ELCU');
          }
          if (variation.entryShortCentsMin !== undefined) {
            suffixParts.push(`ESC${variation.entryShortCentsMin.toFixed(2)}`);
          } else {
            // suffixParts.push('ESCU');
          }
          if (variation.exitLongCentsCeiling !== undefined) {
            suffixParts.push(`XLC${variation.exitLongCentsCeiling.toFixed(2)}`);
          } else {
            // suffixParts.push('XLCU');
          }
          if (variation.exitShortCentsFloor !== undefined) {
            suffixParts.push(`XSC${variation.exitShortCentsFloor.toFixed(2)}`);
          } else {
            // suffixParts.push('XSCU');
          }
          if (
            paramOptions.twoTickDropThresholdCents.length > 1 &&
            variation.twoTickDropThresholdCents !== undefined
          )
            suffixParts.push(`TTD${variation.twoTickDropThresholdCents.toFixed(2)}`);
          if (
            paramOptions.requiredConsecutiveSignalsForEntry.length > 1 &&
            variation.requiredConsecutiveSignalsForEntry !== undefined
          )
            suffixParts.push(`RCSE${variation.requiredConsecutiveSignalsForEntry}`);
          if (paramOptions.minPositionHoldTicks.length > 1)
            suffixParts.push(`MHT${variation.minPositionHoldTicks}`);
          // Add strike selection mode to suffix if not BOTH (default)
          if (
            variation.strikeSelectionMode !== undefined &&
            variation.strikeSelectionMode !== StrikeSelectionMode.BOTH
          ) {
            suffixParts.push(`SM${variation.strikeSelectionMode.toUpperCase()}`);
          }

          const suffix = suffixParts.length > 0 ? suffixParts.join('-') : '';
          for (const type of strategyTypes) {
            configs.push({
              ...baseConfig,
              id: `VOLSKEW-${symbol}-${type}${suffix ? '-' + suffix : ''}`,
              type,
            });
          }
        }
      }
    }

    return configs;
  }

  /**
   * Implementation of createStrategy for Skew strategies
   */
  protected createStrategy(config: BaseStrategyConfig): IStrategy | null {
    try {
      if (isSkewStrategyConfig(config)) {
        return this.instantiationService.createInstance(VolatilitySkewStrategy, config);
      }

      console.warn(`SkewStrategyCollection cannot handle config type: ${config.id}`);
      return null;
    } catch (error) {
      console.error(`Error creating volatility skew strategy for config: ${config.id}`, error);
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
  minPositionHoldTicksOptions: number[] = [0],
): SkewStrategyVariation[] {
  const variations: SkewStrategyVariation[] = [];
  for (const period of periods) {
    for (const volumeWeight of volumeWeights) {
      for (const normalize of normalizeOptions) {
        for (const minPositionHoldTicks of minPositionHoldTicksOptions) {
          variations.push({
            period,
            volumeWeight,
            normalizeByATM: normalize,
            minPositionHoldTicks,
          });
        }
      }
    }
  }
  return variations;
}

/**
 * Creates a default skew strategy collection with predefined parameters.
 * Generates the full Cartesian product of all hyperparameter combinations.
 */
export function createDefaultSkewCollection(
  instantiationService: IInstantiationService,
): SkewStrategyCollection {
  const variations: SkewStrategyVariation[] = [];

  // --- RESTORED ORIGINAL VARIATION GENERATION LOGIC ---
  const weightMethods = [
    // SkewWeightMethod.LIQUIDITY,
    // SkewWeightMethod.ATM_PROXIMITY,
    SkewWeightMethod.EQUAL,
  ];

  // Primary parameters
  const periods = [8, 12];
  const volumeWeights = [0.1];
  const normalizeByATMOptions = [false];
  const maxDeltas = [0.8];
  const minDeltas = [0.2];
  const smoothingPeriods = [20, 15, 30];
  const changeThresholds = [0.8, 1, 1.2];
  const numStrikesList = [5, 8, 13, 21, 34];
  const cooldownTicksOptions = [5];
  // Add strike selection modes
  const strikeSelectionModes = [
    StrikeSelectionMode.ITM,
    StrikeSelectionMode.OTM,
    // StrikeSelectionMode.BOTH,
  ];
  // Entry/exit parameters
  const entryLongCentsMaxOptions = [undefined];
  const entryShortCentsMinOptions = [undefined];
  const exitLongCentsCeilingOptions = [undefined];
  const exitShortCentsFloorOptions = [undefined];

  const twoTickDropThresholdCentsOptions = [0.15];
  const requiredConsecutiveSignalsForEntryOptions = [1];
  const minPositionHoldTicksOptions = [2];

  for (const period of periods) {
    for (const volumeWeight of volumeWeights) {
      for (const normalizeByATM of normalizeByATMOptions) {
        for (const weightMethod of weightMethods) {
          for (const maxDelta of maxDeltas) {
            for (const minDelta of minDeltas) {
              // Ensure minDelta is strictly less than maxDelta
              if (minDelta !== undefined && maxDelta !== undefined && minDelta >= maxDelta) {
                continue;
              }
              for (const smoothingPeriod of smoothingPeriods) {
                for (const changeThreshold of changeThresholds) {
                  for (const numStrikes of numStrikesList) {
                    for (const strikeSelectionMode of strikeSelectionModes) {
                      for (const entryLongCentsMax of entryLongCentsMaxOptions) {
                        for (const entryShortCentsMin of entryShortCentsMinOptions) {
                          for (const exitLongCentsCeiling of exitLongCentsCeilingOptions) {
                            for (const exitShortCentsFloor of exitShortCentsFloorOptions) {
                              for (const cooldownTicksAfterLoss of cooldownTicksOptions) {
                                for (const twoTickDropThresholdCents of twoTickDropThresholdCentsOptions) {
                                  for (const requiredConsecutiveSignalsForEntry of requiredConsecutiveSignalsForEntryOptions) {
                                    for (const minPositionHoldTicks of minPositionHoldTicksOptions) {
                                      variations.push({
                                        period,
                                        volumeWeight,
                                        normalizeByATM,
                                        skewWeightMethod: weightMethod,
                                        maxDelta,
                                        minDelta,
                                        smoothingPeriod,
                                        changeThreshold,
                                        numStrikes,
                                        strikeSelectionMode,
                                        entryLongCentsMax,
                                        entryShortCentsMin,
                                        exitLongCentsCeiling,
                                        exitShortCentsFloor,
                                        cooldownTicksAfterLoss,
                                        twoTickDropThresholdCents,
                                        requiredConsecutiveSignalsForEntry,
                                        minPositionHoldTicks,
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
            }
          }
        }
      }
    }
  }
  // --- END RESTORED LOGIC ---

  // Log the total number of generated variations
  const totalVariations = variations.length;
  console.log(`Generated ${totalVariations} Skew Strategy Variations`);

  // Display a warning if the number is very large
  if (totalVariations > 5000) {
    console.warn(
      `Warning: Generated a very large number of variations (${totalVariations}).` +
        ` This may impact performance. Consider reducing parameter combinations if needed.`,
    );
  }

  return new SkewStrategyCollection(
    variations,
    ['QQQ'], // Default symbol
    [0, 1], // Default expiration index
    instantiationService,
  );
}

/**
 * Type guard to check if a config is a SkewStrategyConfig
 */
export function isSkewStrategyConfig(config: BaseStrategyConfig): config is SkewStrategyConfig {
  return 'indicatorConfig' in config && 'period' in (config as SkewStrategyConfig).indicatorConfig;
}
