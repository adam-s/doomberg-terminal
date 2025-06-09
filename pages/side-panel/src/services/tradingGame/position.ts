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
  // Track current market price for P/L calculation of open positions
  private _currentPrice: number;

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
    // Initialize current price with entry price
    this._currentPrice = params.entryPrice;

    this.debugLog(
      `Created ${this.isLong ? 'LONG' : 'SHORT'} position for ${this.symbol} ` +
        `at price ${this.entryPrice} with quantity ${this.quantity} ` +
        `(ID: ${this.id}, Strategy: ${this.strategyId})`,
    );
  }

  /**
   * Updates the current market price for P/L calculation
   * @param price The latest market price
   */
  public updateCurrentPrice(price: number): void {
    if (this._isOpen) {
      this._currentPrice = price;
    }
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
    // Use provided closePrice or current market price if available
    this._closePrice = closePrice ?? this._currentPrice;

    const pnl = this.getPnL();
    const pnlPercentage = this.getPnLPercentage();

    this.debugLog(
      `Closed ${this.isLong ? 'LONG' : 'SHORT'} position for ${this.symbol} ` +
        `at price ${this._closePrice ?? 'unknown'} ` +
        `(Exit reason: ${exitReason}, ` +
        `PnL: ${pnl !== undefined ? pnl.toFixed(2) : 'unknown'}, ` +
        `PnL%: ${pnlPercentage !== undefined ? pnlPercentage.toFixed(2) + '%' : 'unknown'}, ` +
        `Duration: ${this.durationMs ?? 'unknown'}ms)`,
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
   * Gets the current market price used for P/L calculation
   */
  public get currentPrice(): number {
    return this._currentPrice;
  }

  /**
   * Calculates the profit or loss for this position
   * For open positions, uses current market price
   * For closed positions, uses close price
   * Positive value represents profit, negative value represents loss
   */
  public getPnL(): number {
    // Use close price for closed positions, current price for open positions
    const exitPrice = this._isOpen ? this._currentPrice : this._closePrice;

    // If we don't have a valid price to compare against, P/L is zero
    if (exitPrice === undefined || isNaN(exitPrice)) {
      this.debugLog(`Cannot calculate PnL for position ${this.id}: Invalid exit/current price.`);
      return 0;
    }
    if (this.entryPrice === undefined || isNaN(this.entryPrice)) {
      this.debugLog(`Cannot calculate PnL for position ${this.id}: Invalid entry price.`);
      return 0;
    }

    // For options, P/L is typically multiplied by 100 (shares per contract)
    const multiplier = 100;

    // For both long calls AND long puts, profit = (exit price - entry price)
    // This is because we BOUGHT the option in both cases, hoping its price would increase
    const pnl = (exitPrice - this.entryPrice) * this.quantity * multiplier;

    return pnl;
  }

  /**
   * Calculates the percentage profit or loss for this position
   * Uses current price for open positions, close price for closed positions
   */
  public getPnLPercentage(): number | undefined {
    const pnl = this.getPnL();
    const entryValue = this.entryPrice * this.quantity * 100; // Multiplier for options

    if (entryValue === 0) {
      return undefined;
    }

    return (pnl / entryValue) * 100;
  }

  /**
   * Gets the duration of the position in milliseconds
   */
  public get durationMs(): number | undefined {
    // For open positions, calculate duration to current time
    const endTime = this._closeTime ?? new Date();

    if (!this.entryTime) {
      return undefined;
    }

    return endTime.getTime() - this.entryTime.getTime();
  }
}
