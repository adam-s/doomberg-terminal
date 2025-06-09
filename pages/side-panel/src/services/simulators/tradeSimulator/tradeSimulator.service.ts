import { Disposable } from 'vs/base/common/lifecycle';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { StrategyManager } from './strategy/strategyManager';
import { ChainDataService, IChainDataService } from './data/chainData.service';
import { Emitter, Event } from 'vs/base/common/event';
import { IPerformanceReport } from './strategy/baseStrategy';
import { StrategyCollection } from './strategy/strategyCollection';
import { ISentimentDataService, SentimentDataService } from './data/sentimentData.service';
import { createDefaultSkewCollection } from './strategy/collections/skewStrategyCollection';

export const ITradeSimulatorService =
  createDecorator<ITradeSimulatorService>('tradeSimulatorService');

export const IStrategyManager = createDecorator<StrategyManager>('strategyManager');

export interface ITradeSimulatorService {
  readonly _serviceBrand: undefined;
  start(): Promise<ITradeSimulatorService>;
  onPerformanceUpdate: Event<IPerformanceReport[]>;
}

export class TradeSimulatorService extends Disposable implements ITradeSimulatorService {
  readonly _serviceBrand: undefined;
  private readonly performanceEmitter = new Emitter<IPerformanceReport[]>();
  public readonly onPerformanceUpdate: Event<IPerformanceReport[]> = this.performanceEmitter.event;

  private instantiationService!: IInstantiationService;
  private strategyManager!: StrategyManager;
  private strategyCollections: StrategyCollection[] = [];

  constructor(
    @IInstantiationService private readonly mainInstantiationService: IInstantiationService,
  ) {
    super();
  }

  async start(): Promise<ITradeSimulatorService> {
    this.instantiationService = await this.initServices();

    // Create strategy collections
    this.initStrategyCollections();

    // Get the strategy manager and start it with our collections
    this.strategyManager = this._register(
      this.instantiationService.invokeFunction(accessor => {
        const manager = accessor.get(IStrategyManager);
        manager.start(this.strategyCollections);
        return manager;
      }),
    );

    // Register performance update handler
    this._register(
      this.strategyManager.onPerformanceUpdate(event => {
        this.performanceEmitter.fire(event);
      }),
    );

    return this;
  }

  private async initServices(): Promise<IInstantiationService> {
    const services = new ServiceCollection();
    const instantiationService = this.mainInstantiationService.createChild(services);

    // Register required services
    services.set(IChainDataService, instantiationService.createInstance(ChainDataService));
    services.set(ISentimentDataService, instantiationService.createInstance(SentimentDataService));

    // Register StrategyManager as a service
    services.set(IStrategyManager, new SyncDescriptor(StrategyManager));

    return instantiationService;
  }

  /**
   * Initialize strategy collections
   */
  private initStrategyCollections(): void {
    // Add the skew2 strategy collection
    const skewCollection = createDefaultSkewCollection(this.instantiationService);
    this.strategyCollections.push(skewCollection);
    // Only skew2Collection is added to strategyCollections
  }
}
