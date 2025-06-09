import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';

export enum StrategySignal {
  BUY = 0,
  SELL = 1,
  HOLD = 2,
}

export interface IPerformanceReport {
  id: string;
  pnl: number;
  unrealizedPnL: number;
  currentPrice: number;
  trades: number;
  winRate: number;
  averageTradeProfit: number;
  tradeProfits: number[]; // Array of trade profits for median calculation
  position: {
    price: number;
    isLong: boolean;
    entryTime: number;
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
  lastSignal?: {
    signal: StrategySignal;
    price: number;
    timestamp: number;
  };
}

export interface BaseStrategyConfig {
  id: string;
  type: StrategyType;
  symbol: string;
}

export interface IStrategy {
  readonly id: string;
  readonly type: StrategyType;
  readonly symbol: string;
  readonly config: BaseStrategyConfig;
  readonly onPerformanceUpdate: Event<IPerformanceReport>;
  readonly onStrategyStateChange: Event<Omit<IStrategyState, 'id'>>;
  getPerformanceReport(windowSize?: number): IPerformanceReport; // Accept optional windowSize
  getStrategyState(): Omit<IStrategyState, 'id'>;
  dispose(): void;
}

export enum StrategyType {
  LONG = 'LONG',
  SHORT = 'SHORT',
  TWO_WAY = 'TWO_WAY',
}

export interface Position {
  price: number;
  isLong: boolean;
  entryTime: number;
  maxPrice?: number;
  minPrice?: number;
}

export interface Trade {
  profit: number;
  isWin: boolean;
  exitPrice: number;
  entryPrice: number;
  duration: number;
}

export interface Metrics {
  winningTrades: number;
  cumulativePnL: number;
  unrealizedPnL: number;
  trades: number;
}

export interface IStrategyPerformance {
  id: string;
  position: Position | null;
  lastTrade?: Trade;
  metrics: Map<string, Metrics>;
}

export interface IPerformanceSnapshot {
  timestamp: number;
  currentPrice: number;
  cumulativePnL: number;
  unrealizedPnL: number;
  trades: number;
  winningTrades: number;
  position: Position | null;
  lastTrade?: Trade;
}

export interface IWindowedPerformanceReport extends IPerformanceReport {
  windowSizeUsed: number | 'ALL';
}

export interface IStrategyState {
  currentPrice: number;
  position: Position | null;
  lastTrade?: Trade;
  metrics: Map<string, Metrics>;
}

export type MetricPeriod = 'ALL' | number | string;

export abstract class BaseStrategy extends Disposable implements IStrategy {
  protected static readonly TRANSACTION_FEE = 0.0104;
  private readonly _onPerformanceUpdate = this._register(new Emitter<IPerformanceReport>());
  private readonly _onStrategyStateChange = this._register(
    new Emitter<Omit<IStrategyState, 'id'>>(),
  );
  public readonly onPerformanceUpdate = this._onPerformanceUpdate.event;
  public readonly onStrategyStateChange = this._onStrategyStateChange.event;
  public readonly symbol: string;
  public readonly id: string;
  public readonly type: StrategyType;
  protected readonly MAX_HISTORY = 200; // Reduced from 4000 to 1000
  protected performanceBuffer: Array<IPerformanceSnapshot | null> = new Array(this.MAX_HISTORY);
  protected bufferStart = 0;
  protected bufferCount = 0;
  protected performance: IStrategyPerformance;

  // Add these fields to track performance
  private cumulativePnL: number = 0;
  private totalTrades: number = 0;
  private winningTrades: number = 0;
  private tradeProfits: number[] = [];

  constructor(public readonly config: BaseStrategyConfig) {
    super();
    this.id = config.id;
    this.type = config.type;
    this.symbol = config.symbol;
    this.performance = {
      id: this.id,
      position: null,
      metrics: new Map(),
    };
  }

  protected emitPerformanceUpdate(): void {
    this._onPerformanceUpdate.fire(this.getPerformanceReport());
  }

  protected emitStrategyStateChange(): void {
    this._onStrategyStateChange.fire(this.getStrategyState());
  }

  protected storePerformanceSnapshot(
    price: number,
    timestamp: number,
    unrealizedPnL: number,
  ): void {
    const createSnapshot = (): IPerformanceSnapshot => {
      return {
        timestamp,
        currentPrice: price,
        cumulativePnL: this.cumulativePnL, // Use tracked cumulative P&L
        unrealizedPnL,
        trades: this.totalTrades, // Use tracked total trades
        winningTrades: this.winningTrades, // Use tracked winning trades
        position: this.performance.position && { ...this.performance.position },
        lastTrade: this.performance.lastTrade && { ...this.performance.lastTrade },
      };
    };

    const updateBufferIndices = (): void => {
      if (this.bufferCount < this.MAX_HISTORY) {
        this.bufferCount++;
      } else {
        this.bufferStart = (this.bufferStart + 1) % this.MAX_HISTORY;
      }
    };

    const idx = (this.bufferStart + this.bufferCount) % this.MAX_HISTORY;
    this.performanceBuffer[idx] = createSnapshot();
    updateBufferIndices();
    this.emitStrategyStateChange();
  }

  protected updateMetrics(): void {}

  public getPerformanceReport(): IPerformanceReport {
    if (this.bufferCount === 0) {
      return {
        id: this.performance.id,
        pnl: this.cumulativePnL,
        unrealizedPnL: 0,
        currentPrice: 0,
        trades: this.totalTrades,
        winRate: this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0,
        averageTradeProfit: this.totalTrades > 0 ? this.cumulativePnL / this.totalTrades : 0,
        tradeProfits: [...this.tradeProfits], // Return a copy of tradeProfits
        position: null,
        lastTrade: undefined,
      };
    }

    const lastSnap =
      this.performanceBuffer[(this.bufferStart + this.bufferCount - 1) % this.MAX_HISTORY]!;

    const winRate = this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0;

    return {
      id: this.performance.id,
      pnl: this.cumulativePnL,
      unrealizedPnL: lastSnap.unrealizedPnL,
      currentPrice: lastSnap.currentPrice,
      trades: this.totalTrades,
      winRate,
      averageTradeProfit: this.totalTrades > 0 ? this.cumulativePnL / this.totalTrades : 0,
      tradeProfits: [...this.tradeProfits], // Return a copy of tradeProfits
      position: this.performance.position ? { ...this.performance.position } : null,
      lastTrade: this.performance.lastTrade,
    };
  }

  abstract getStrategyState(): Omit<IStrategyState, 'id'>;

  /**
   * Call this method whenever a trade is executed to update the strategy's performance metrics.
   * @param trade The trade that was executed.
   */
  protected updatePerformanceOnTrade(trade: Trade): void {
    this.totalTrades++;
    this.cumulativePnL += trade.profit;
    this.tradeProfits.push(trade.profit);
    if (trade.isWin) {
      this.winningTrades++;
    }
    this.performance.lastTrade = trade;
  }
}
