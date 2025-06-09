import { OrderState } from '@shared/services/request.types';
import { ExitReason } from './types';
import { Emitter, Event } from 'vs/base/common/event';
import { Position } from './position';
import { IData } from './data';

export class Order {
  public readonly id: string;
  public readonly openTime: Date;
  public readonly strategyId: string;

  // New properties for order tracking
  private _state: OrderState = OrderState.New;
  private _fillAmount: number = 0;
  private _closeTime?: Date;
  private _exitReason?: ExitReason;
  private _position?: Position;
  private _executionPrice?: number;

  // Events
  private readonly _onFilled = new Emitter<Position | undefined>();
  public readonly onFilled: Event<Position | undefined> = this._onFilled.event;

  private readonly _onCancelled = new Emitter<void>();
  public readonly onCancelled: Event<void> = this._onCancelled.event;

  constructor(
    readonly symbol: string,
    readonly isLong: boolean,
    strategyId: string,
    readonly size: number = 1,
    readonly instrumentId?: string,
    private readonly dataService?: IData,
    readonly isClosingPosition: boolean = false,
  ) {
    this.id = `${symbol}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.openTime = new Date();
    this.strategyId = strategyId;
  }

  // Getters and setters for order state
  public get state(): OrderState {
    return this._state;
  }

  public set state(newState: OrderState) {
    this._state = newState;
  }

  public get fillAmount(): number {
    return this._fillAmount;
  }

  public set fillAmount(amount: number) {
    this._fillAmount = Math.min(Math.max(0, amount), this.size);
  }

  public get isFilled(): boolean {
    return (
      this._state === OrderState.Filled ||
      (this._state === OrderState.PartiallyFilled && this._fillAmount === this.size)
    );
  }

  public get isPartiallyFilled(): boolean {
    return this._state === OrderState.PartiallyFilled && this._fillAmount < this.size;
  }

  public get isActive(): boolean {
    return this._state !== OrderState.Cancelled && this._state !== OrderState.Filled;
  }

  /**
   * Gets the execution price of the order
   */
  public get executionPrice(): number | undefined {
    return this._executionPrice;
  }

  /**
   * Executes the order based on whether it's opening or closing a position
   */
  public async execute(): Promise<void> {
    // Use the explicit isClosingPosition flag instead of inferring from instrumentId
    if (this.isClosingPosition) {
      return this.executeSellOrder();
    } else {
      return this.executeBuyOrder();
    }
  }

  /**
   * Executes a mock buy order.
   */
  private async executeBuyOrder(): Promise<void> {
    if (!this.dataService) {
      throw new Error('Data service is required to execute buy orders');
    }
    try {
      // Get option chain for the symbol
      const optionChain = this.dataService.getOptionChain(this.symbol);
      if (!optionChain) {
        throw new Error(`No option chain found for ${this.symbol}`);
      }

      // Get current price of underlying - still useful for context, but not primary filter
      const currentPrice = optionChain.optionsData$.get()?.lastTradePrice;
      if (!currentPrice) {
        throw new Error(`No current price available for ${this.symbol}`);
      }

      // Get the nearest expiration date
      const expirationDates = optionChain.expirationDates$.get();
      if (!expirationDates.length) {
        throw new Error(`No expiration dates available for ${this.symbol}`);
      }
      const expirationDate = expirationDates[0];

      // Determine option type from strategy settings
      const optionType = this.isLong ? 'call' : 'put';

      // Get *all* options for the selected expiration and type initially
      const allOptionsForDateAndType = optionChain
        .getInstrumentsByDateAndType(expirationDate, optionType)
        ?.filter(option => option.type === optionType);

      if (!allOptionsForDateAndType || allOptionsForDateAndType.length === 0) {
        throw new Error(
          `No options available for ${this.symbol} with expiration ${expirationDate} and type ${optionType}`,
        );
      }

      // Get market data for *all* these options to access delta
      const marketDataMap = optionChain.marketData$.get();
      if (!marketDataMap || marketDataMap.size === 0) {
        throw new Error(`No market data available for options on ${expirationDate}`);
      }

      // Combine options with their market data (delta)
      const optionsWithDelta = allOptionsForDateAndType
        .map(option => {
          const marketData = marketDataMap.get(option.id);
          const delta = marketData?.delta ? parseFloat(marketData.delta) : NaN;
          return { ...option, delta };
        })
        .filter(option => !isNaN(option.delta)); // Filter out options without valid delta

      if (optionsWithDelta.length === 0) {
        throw new Error(
          `No options with valid delta found for ${this.symbol} on ${expirationDate}`,
        );
      }

      // Filter by delta threshold
      let filteredOptions;
      if (optionType === 'call') {
        // Find calls with delta < 0.25 and positive
        filteredOptions = optionsWithDelta.filter(
          option => option.delta < 0.25 && option.delta > 0,
        );
        // Sort descending by delta (closest to 0.25 first)
        filteredOptions.sort((a, b) => b.delta - a.delta);
      } else {
        // Find puts with delta > -0.25 and negative
        filteredOptions = optionsWithDelta.filter(
          option => option.delta > -0.25 && option.delta < 0,
        );
        // Sort ascending by delta (closest to -0.25 first)
        filteredOptions.sort((a, b) => a.delta - b.delta);
      }

      if (filteredOptions.length === 0) {
        throw new Error(
          `No options found for ${this.symbol} meeting delta criteria (< 0.25 for calls, > -0.25 for puts)`,
        );
      }

      // Select the option with delta closest to the threshold (first in sorted list)
      const selectedOption = filteredOptions[0];

      // Get the specific quote for the selected option
      const quote = marketDataMap.get(selectedOption.id);
      if (!quote) {
        // This should ideally not happen if marketDataMap was populated correctly
        throw new Error(`Market data quote missing for selected option ${selectedOption.id}`);
      }

      // Extract the ask price from the quote
      const askPrice = parseFloat(quote?.ask_price ?? '');
      if (isNaN(askPrice)) {
        throw new Error(`Invalid ask price for option ${selectedOption.id}`);
      }

      // Update order state
      this._state = OrderState.Filled;
      this._fillAmount = this.size;
      this._executionPrice = askPrice;

      // Create a new position from this order
      this._position = new Position({
        id: this.id,
        symbol: this.symbol,
        instrumentId: selectedOption.id,
        isLong: this.isLong,
        entryPrice: askPrice,
        quantity: this.size,
        entryTime: new Date(),
        strategyId: this.strategyId,
      });

      // Log purchase information
      console.log(
        `Purchased option ${selectedOption.id} (Delta: ${selectedOption.delta.toFixed(4)}) at price $${askPrice}`,
      );

      // Emit filled event
      this._onFilled.fire(this._position);
    } catch (error) {
      console.error('Error executing buy order:', error);
      this._state = OrderState.Cancelled;
      this._onCancelled.fire();
    }
  }

  /**
   * Executes a mock sell order to close a position.
   */
  private async executeSellOrder(): Promise<void> {
    if (!this.dataService) {
      throw new Error('Data service is required to execute sell orders');
    }

    try {
      if (!this.instrumentId) {
        throw new Error('Instrument ID is required to close a position');
      }

      // Get option chain for the symbol
      const optionChain = this.dataService.getOptionChain(this.symbol);
      if (!optionChain) {
        throw new Error(`No option chain found for ${this.symbol}`);
      }

      // Get market data directly from the option chain
      const marketData = optionChain.marketData$.get();
      if (!marketData || !marketData.get(this.instrumentId)) {
        throw new Error(`No market data available for option ${this.instrumentId}`);
      }

      // Access the quote directly from market data
      const quote = marketData.get(this.instrumentId);

      // Extract the bid price from the quote for selling
      const bidPrice = parseFloat(quote?.bid_price ?? '');
      if (isNaN(bidPrice)) {
        throw new Error(`Invalid bid price for option ${this.instrumentId}`);
      }

      // Update order state
      this._state = OrderState.Filled;
      this._fillAmount = this.size;
      this._executionPrice = bidPrice;
      this._closeTime = new Date();

      // Log sale information
      console.log(`Sold option ${this.instrumentId} at price $${bidPrice}`);

      // If there's an existing position, close it
      if (this._position) {
        // Close the position with the calculated bid price
        this._position.close(this._exitReason || ExitReason.MANUAL, bidPrice);
      }

      // Emit filled event
      this._onFilled.fire(this._position);
    } catch (error) {
      console.error('Error executing sell order:', error);
      this._state = OrderState.Cancelled;
      this._onCancelled.fire();
    }
  }

  /**
   * Gets the exit reason for the order.
   */
  public get exitReason(): ExitReason | undefined {
    return this._exitReason;
  }

  /**
   * Gets the close time for the order.
   */
  public get closeTime(): Date | undefined {
    return this._closeTime;
  }

  /**
   * Gets the position associated with the order.
   */
  public get position(): Position | undefined {
    return this._position;
  }
}
