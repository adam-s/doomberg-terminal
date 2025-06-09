import { IStrategy } from './baseStrategy';
import { StrategyManager } from './strategyManager';

export interface IStrategyEventEmitter {
  getAllPerformances(): Map<string, IStrategyPerformance>;
}

export interface IStrategyService extends IStrategyEventEmitter {
  getAllStrategies(): Map<string, IStrategy>;

  /**
   * Retrieves all performances with an optional window size.
   * @param windowSize Number of periods to consider for performance.
   */
  getAllPerformances(windowSize?: number): Map<string, IStrategyPerformance>;

  /**
   * Retrieves a specific strategy by ID.
   * @param id Strategy identifier.
   */
  getStrategy(id: string): IStrategy | undefined;

  /**
   * Retrieves the performance of a specific strategy with an optional window size.
   * @param id Strategy identifier.
   * @param windowSize Number of periods to consider for performance.
   */
  getPerformance(id: string, windowSize?: number): IStrategyPerformance | undefined;

  service: StrategyManager;
}

export interface IStrategyPerformance {
  pnl: number;
  trades: number;
  winningTrades: number;
  currentPrice: number; // Added for price tracking
  position: {
    price: number;
    isLong: boolean;
    entryTime: number; // Added for timing
    maxPrice?: number;
    minPrice?: number;
  } | null;
  lastTrade?: {
    profit: number;
    isWin: boolean;
    exitPrice: number;
    entryPrice: number;
    duration: number;
  };
}
