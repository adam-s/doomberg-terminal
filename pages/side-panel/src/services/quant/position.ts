import { ExitReason } from './types';

// Enable debug logging
const debug = true;

/**
 * Position initialization parameters
 */
export interface PositionParams {
  id: string;
  symbol: string;
  instrumentId?: string;
  isLong: boolean;
  entryPrice: number;
  quantity: number;
  entryTime: Date;
  strategyId: string;
}

/**
 * Represents a trading position opened in the market
 */
export class Position {
  public readonly id: string;
  public readonly symbol: string;
  public readonly instrumentId?: string;
  public readonly isLong: boolean;
  public readonly entryPrice: number;
  public readonly quantity: number;
  public readonly entryTime: Date;
  public readonly strategyId: string;

  private _isOpen: boolean = true;
  private _closePrice?: number;
  private _closeTime?: Date;
  private _exitReason?: ExitReason;

  /**
   * Debug log helper that only logs when debug is enabled
   * @param message The message to log
   */
  private debugLog(message: string): void {
    if (debug) {
      console.log(`[Position] ${message}`);
    }
  }

  /**
   * Creates a new position
   *
   * @param params Position initialization parameters
   */
  constructor(params: PositionParams) {
    this.id = params.id;
    this.symbol = params.symbol;
    this.instrumentId = params.instrumentId;
    this.isLong = params.isLong;
    this.entryPrice = params.entryPrice;
    this.quantity = params.quantity;
    this.entryTime = params.entryTime;
    this.strategyId = params.strategyId;

    this.debugLog(
      `Created ${this.isLong ? 'LONG' : 'SHORT'} position for ${this.symbol} ` +
        `at price ${this.entryPrice} with quantity ${this.quantity} ` +
        `(ID: ${this.id}, Strategy: ${this.strategyId})`,
    );
  }

  /**
   * Closes the position
   *
   * @param exitReason Reason for closing the position
   * @param closePrice Price at which the position was closed
   */
  public close(exitReason: ExitReason, closePrice?: number): void {
    // Don't close an already closed position
    if (!this._isOpen) {
      this.debugLog(`Attempted to close already closed position ${this.id}`);
      return;
    }

    this._isOpen = false;
    this._exitReason = exitReason;
    this._closeTime = new Date();
    this._closePrice = closePrice;

    const pnl = this.getPnL();
    const pnlPercentage = this.getPnLPercentage();

    this.debugLog(
      `Closed ${this.isLong ? 'LONG' : 'SHORT'} position for ${this.symbol} ` +
        `at price ${this._closePrice ?? 'unknown'} ` +
        `(Exit reason: ${exitReason}, ` +
        `PnL: ${pnl !== undefined ? pnl.toFixed(2) : 'unknown'}, ` +
        `PnL%: ${pnlPercentage !== undefined ? pnlPercentage.toFixed(2) + '%' : 'unknown'}, ` +
        `Duration: ${this._closeTime.getTime() - this.entryTime.getTime()}ms)`,
    );
  }

  /**
   * Gets whether the position is open
   */
  public get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Gets the price at which the position was closed
   */
  public get closePrice(): number | undefined {
    return this._closePrice;
  }

  /**
   * Gets the time when the position was closed
   */
  public get closeTime(): Date | undefined {
    return this._closeTime;
  }

  /**
   * Gets the reason why the position was closed
   */
  public get exitReason(): ExitReason | undefined {
    return this._exitReason;
  }

  /**
   * Calculates the profit or loss for this position
   * Positive value represents profit, negative value represents loss
   */
  public getPnL(): number {
    if (!this._closePrice) {
      return 0;
    }

    const priceDifference = this._closePrice - this.entryPrice;

    return priceDifference * this.quantity;
  }

  /**
   * Calculates the percentage profit or loss for this position
   */
  public getPnLPercentage(): number | undefined {
    if (!this._closePrice) {
      return undefined;
    }

    const pnl = this.getPnL();
    if (pnl === undefined) {
      return undefined;
    }

    return (pnl / (this.entryPrice * this.quantity)) * 100;
  }

  /**
   * Gets the duration of the position in milliseconds
   */
  public get durationMs(): number | undefined {
    if (!this._closeTime) {
      return undefined;
    }

    return this._closeTime.getTime() - this.entryTime.getTime();
  }
}
