import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStrategy } from './baseStrategy';
import { StrategyConfig } from './collections/extrinsicStrategyCollection';
import { Emitter, Event } from 'vs/base/common/event';

/**
 * Base class for strategy collections that manages strategy creation and registration.
 */
export abstract class StrategyCollection extends Disposable {
  protected readonly strategies = new Map<string, IStrategy>();
  protected strategyConfigs: StrategyConfig[] = [];
  protected pendingUpdate = false;

  // Add event emitter for collection updates
  private readonly _onCollectionUpdate = this._register(new Emitter<void>());
  public readonly onCollectionUpdate: Event<void> = this._onCollectionUpdate.event;

  constructor(
    @IInstantiationService protected readonly instantiationService: IInstantiationService,
  ) {
    super();
  }

  /**
   * Initializes and starts the strategy collection
   */
  public start(): void {
    // Load strategy configurations
    this.loadConfigurations();

    // Initialize strategies
    this.initializeStrategies();
  }

  /**
   * Load strategy configurations - to be implemented by subclasses
   */
  protected abstract loadConfigurations(): void;

  /**
   * Creates a strategy instance based on configuration type
   * This method is implemented by subclasses to handle specific strategy types
   */
  protected abstract createStrategy(config: StrategyConfig): IStrategy | null;

  /**
   * Creates and registers each strategy instance using the configurations.
   */
  protected initializeStrategies(): void {
    for (const config of this.strategyConfigs) {
      const strategy = this.createStrategy(config);
      if (strategy) {
        this._register(strategy);
        this.strategies.set(strategy.id, strategy);
      }
    }

    for (const strategy of this.strategies.values()) {
      this._register(
        strategy.onPerformanceUpdate(() => {
          this.pendingUpdate = true;
          // Emit event when any strategy updates
          this._onCollectionUpdate.fire();
        }),
      );
    }
  }

  /**
   * Returns all strategies created by this collection
   */
  public getAllStrategies(): Map<string, IStrategy> {
    return this.strategies;
  }
}
