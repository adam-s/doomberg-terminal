import { Disposable } from 'vs/base/common/lifecycle';
import { IStrategy, IPerformanceReport } from './baseStrategy';
import { Emitter, Event } from 'vs/base/common/event';
import { IStrategyPerformance, IStrategyService } from './types';
import { StrategyCollection } from './strategyCollection';
import { ITimerService } from '@src/services/timer.service';

/**
 * Interval in milliseconds for performance updates
 */
const PERFORMANCE_UPDATE_INTERVAL = 500;

/**
 * Defines the cost and slippage settings to be applied to trades.
 */
interface TradeSettings {
  tradingCost: number;
  slippagePercent: number;
}

/**
 * Manages the lifecycle and performance of multiple strategies. Automatically
 * generates systematic configurations, initializes corresponding strategies,
 * and updates performance metrics upon receiving signals from each strategy.
 */
export class StrategyManager extends Disposable implements IStrategyService {
  private readonly _onPerformanceUpdate = this._register(new Emitter<IPerformanceReport[]>());
  public readonly onPerformanceUpdate: Event<IPerformanceReport[]> =
    this._onPerformanceUpdate.event;

  private readonly tradeSettings: TradeSettings = {
    tradingCost: 0.0208,
    slippagePercent: 0,
  };

  private readonly _updateTimerId = 'strategy-manager-update';
  private pendingUpdate = false;
  public readonly service: StrategyManager = this;
  private collections: StrategyCollection[] = [];

  constructor(@ITimerService private readonly timerService: ITimerService) {
    super();
  }

  /**
   * Start the strategy manager with the provided collections
   * @param collections The strategy collections to manage
   * @throws Error if no collections are provided
   */
  public start(collections: StrategyCollection[]): void {
    if (!collections || collections.length === 0) {
      throw new Error('At least one strategy collection must be provided to StrategyManager');
    }

    this.collections = collections;

    // Start each collection
    for (const collection of this.collections) {
      this._register(collection);

      // Register to collection updates
      this._register(
        collection.onCollectionUpdate(() => {
          this.pendingUpdate = true;
        }),
      );

      collection.start();
    }

    // Start performance monitoring
    this.startPerformanceUpdateInterval();
  }

  private startPerformanceUpdateInterval(): void {
    // Create new interval using timer service
    this._register(
      this.timerService.subscribeToTimer(this._updateTimerId, PERFORMANCE_UPDATE_INTERVAL, () => {
        if (this.pendingUpdate) {
          this.emitPerformanceUpdate();
          this.pendingUpdate = false;
        }
      }),
    );
  }

  private emitPerformanceUpdate(): void {
    const reports = this.getPerformanceReport();
    this._onPerformanceUpdate.fire(reports);
  }

  /**
   * Constructs a combined performance report for all strategies.
   * Sorts them so "DYNAMIC-STRATEGY" is always first, and the rest
   * are sorted descending by windowed PnL.
   *
   * @param windowSize Number of periods to consider for performance.
   */
  private getPerformanceReport(windowSize: number = 0): IPerformanceReport[] {
    const reports = Array.from(this.getAllStrategies().values()).map(strat =>
      strat.getPerformanceReport(windowSize > 0 ? windowSize : undefined),
    );
    return reports.sort((a, b) => b.pnl - a.pnl);
  }

  public getAllStrategies(): Map<string, IStrategy> {
    const allStrategies = new Map<string, IStrategy>();
    for (const collection of this.collections) {
      for (const [id, strategy] of collection.getAllStrategies()) {
        allStrategies.set(id, strategy);
      }
    }
    return allStrategies;
  }

  /**
   * Retrieves all performances with an optional window size.
   * @param windowSize Number of periods to consider for performance.
   */
  public getAllPerformances(windowSize: number = 0): Map<string, IStrategyPerformance> {
    const performances = new Map<string, IStrategyPerformance>();
    for (const [id, strategy] of this.getAllStrategies()) {
      const report = strategy.getPerformanceReport(windowSize > 0 ? windowSize : undefined);
      performances.set(id, {
        pnl: report.pnl,
        trades: report.trades,
        winningTrades: Math.round(report.trades * (report.winRate / 100)),
        position: report.position,
        lastTrade: report.lastTrade,
        currentPrice: report.currentPrice,
      });
    }
    return performances;
  }

  public getStrategy(id: string): IStrategy | undefined {
    for (const collection of this.collections) {
      const strategy = collection.getAllStrategies().get(id);
      if (strategy) return strategy;
    }
    return undefined;
  }

  /**
   * Retrieves the performance of a specific strategy with an optional window size.
   * @param id Strategy identifier.
   * @param windowSize Number of periods to consider for performance.
   */
  public getPerformance(id: string, windowSize: number = 0): IStrategyPerformance | undefined {
    const strategy = this.getStrategy(id);
    if (!strategy) return undefined;

    const report = strategy.getPerformanceReport(windowSize > 0 ? windowSize : undefined);
    return {
      pnl: report.pnl,
      trades: report.trades,
      winningTrades: Math.round(report.trades * (report.winRate / 100)),
      currentPrice: report.currentPrice,
      position: report.position,
      lastTrade: report.lastTrade,
    };
  }
}
