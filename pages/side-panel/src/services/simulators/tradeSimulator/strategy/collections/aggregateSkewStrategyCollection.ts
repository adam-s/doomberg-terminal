import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StrategyCollection } from '../strategyCollection';
import { IStrategy, BaseStrategyConfig, StrategyType, IPerformanceReport } from '../baseStrategy';
import { AggregateSkewStrategy } from '../strategies/aggregateSkewStrategy';
import { Emitter, Event } from 'vs/base/common/event';

/**
 * The interval in milliseconds between batch processing updates
 */
const UPDATE_INTERVAL_MS = 500;

export interface AggregatedSkewStrategyConfig extends BaseStrategyConfig {
  topPercent: number; // Fraction of top strategies to aggregate (0 < topPercent <= 1)
  requiredConsecutiveSignals: number;
  requiredConsensusPercent: number; // Minimum percentage consensus required (0 < requiredConsensusPercent <= 1)
}

export interface AggregatedSkewStrategyVariation {
  topPercent: number;
  requiredConsecutiveSignals: number;
  requiredConsensusPercent: number;
}

export function generateAggregatedSkewVariations(
  topPercents: number[],
  requiredConsecutiveSignalsOptions: number[] = [1],
  requiredConsensusPercents: number[] = [0.51], // Default to 51% if not provided
): AggregatedSkewStrategyVariation[] {
  const variations: AggregatedSkewStrategyVariation[] = [];
  for (const topPercent of topPercents) {
    for (const signals of requiredConsecutiveSignalsOptions) {
      for (const consensus of requiredConsensusPercents) {
        variations.push({
          topPercent,
          requiredConsecutiveSignals: signals,
          requiredConsensusPercent: consensus,
        });
      }
    }
  }
  return variations;
}

export function createDefaultAggregatedSkewCollection(
  baseCollections: StrategyCollection[],
  instantiationService: IInstantiationService,
): AggregatedSkewStrategyCollection {
  // Define hyperparameters
  const topPercents = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]; // Top percent of strategies to aggregate
  const requiredConsecutiveSignalsOptions = [1];
  const requiredConsensusPercents = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]; // Add the desired consensus levels
  const variations = generateAggregatedSkewVariations(
    topPercents,
    requiredConsecutiveSignalsOptions,
    requiredConsensusPercents, // Pass the consensus levels
  );
  console.log(`Generated ${variations.length} Aggregated Skew Strategy variations`);
  return new AggregatedSkewStrategyCollection(baseCollections, variations, instantiationService);
}

export class AggregatedSkewStrategyCollection extends StrategyCollection {
  private readonly _onPerformanceUpdate = this._register(new Emitter<IPerformanceReport[]>());
  public readonly onPerformanceUpdate: Event<IPerformanceReport[]> =
    this._onPerformanceUpdate.event;

  private readonly baseCollections: StrategyCollection[];
  private readonly variations: AggregatedSkewStrategyVariation[];
  private readonly aggregatedStrategies: Map<string, AggregateSkewStrategy> = new Map();
  private _pendingUpdate = false;
  private _intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    baseCollections: StrategyCollection[],
    variations: AggregatedSkewStrategyVariation[],
    @IInstantiationService instantiationService: IInstantiationService,
  ) {
    super(instantiationService);
    this.baseCollections = baseCollections;
    this.variations = variations;
    this.loadConfigurations();
    this.initializeStrategies();

    // Listen for ANY child-strategy performance-update via onCollectionUpdate
    for (const collection of this.baseCollections) {
      this._register(
        collection.onCollectionUpdate(() => {
          this._pendingUpdate = true;
        }),
      );
    }

    // Start interval to batch-process updates
    this._startUpdateInterval();
  }

  protected loadConfigurations(): void {
    this.strategyConfigs = this.getConfigs();
  }

  public getConfigs(): AggregatedSkewStrategyConfig[] {
    return this.variations.map(variation => ({
      id: `AGG-SKEW-TOP${variation.topPercent}-S${variation.requiredConsecutiveSignals}-C${variation.requiredConsensusPercent}`,
      type: StrategyType.TWO_WAY,
      symbol: 'AGG',
      topPercent: variation.topPercent,
      requiredConsecutiveSignals: variation.requiredConsecutiveSignals,
      requiredConsensusPercent: variation.requiredConsensusPercent,
    }));
  }

  protected createStrategy(config: BaseStrategyConfig): IStrategy | null {
    if ('topPercent' in config) {
      const strategy = new AggregateSkewStrategy(
        config as AggregatedSkewStrategyConfig,
        this.baseCollections,
      );
      this.aggregatedStrategies.set(config.id, strategy);
      this._register(strategy);
      return strategy;
    }
    return null;
  }

  private _startUpdateInterval(): void {
    this._intervalId = setInterval(() => {
      // Only process if an update is pending
      if (!this._pendingUpdate) {
        return;
      }
      this._pendingUpdate = false; // Reset flag

      // 1. Pull fresh reports from base collection and fan out to aggregate strategies
      this._handlePerformanceUpdates();

      // 2. Call maybeEvaluate on each aggregate strategy
      this._evaluateStrategies();

      // 3. Emit the performance reports of the aggregate strategies themselves
      this._emitPerformanceUpdate();
    }, UPDATE_INTERVAL_MS);

    // Register interval for disposal
    this._register({
      dispose: () => {
        if (this._intervalId !== null) {
          clearInterval(this._intervalId);
          this._intervalId = null;
        }
      },
    });
  }

  /** Pull fresh IPerformanceReport[] from every child of baseCollections */
  private _handlePerformanceUpdates(): void {
    // Aggregate reports from all base collections
    const baseReports: IPerformanceReport[] = [];
    for (const collection of this.baseCollections) {
      for (const strat of collection.getAllStrategies().values()) {
        baseReports.push(strat.getPerformanceReport());
      }
    }
    // Forward reports to all managed aggregate strategies
    for (const aggStrategy of this.aggregatedStrategies.values()) {
      aggStrategy.onReportsUpdate(baseReports);
    }
  }

  /** Trigger evaluation of all aggregate strategies if they have pending updates */
  private _evaluateStrategies(): void {
    for (const aggStrategy of this.aggregatedStrategies.values()) {
      if ('maybeEvaluate' in aggStrategy && typeof aggStrategy.maybeEvaluate === 'function') {
        aggStrategy.maybeEvaluate();
      }
    }
  }

  /** Emit our own aggregated-strategies' performance */
  private _emitPerformanceUpdate(): void {
    // Get reports from all aggregate strategies managed by this collection
    const reports = Array.from(this.aggregatedStrategies.values()).map(strategy =>
      strategy.getPerformanceReport(),
    );
    // Fire the event with the collected reports
    this._onPerformanceUpdate.fire(reports);
  }

  // Ensure getAllStrategies includes the aggregated strategies
  public override getAllStrategies(): Map<string, IStrategy> {
    // Create a new map to avoid modifying the internal one
    const allStrategies = new Map<string, IStrategy>();

    // Add all the aggregated strategies
    for (const [id, strategy] of this.aggregatedStrategies.entries()) {
      allStrategies.set(id, strategy);
    }

    return allStrategies;
  }
}
