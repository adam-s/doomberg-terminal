import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { observableValue, IObservable, transaction, autorun } from 'vs/base/common/observable';

import { IData } from './data';
import { ExitReason } from './types';
import { Position } from './position';
import { Order } from './order';
import { Event } from 'vs/base/common/event';

const debug = true;

/**
 * Manages trading orders and positions manually.
 */
export class TradeManager extends Disposable {
  // Active orders (not closed)
  private readonly _activeOrders$ = observableValue<Map<string, Order>>(
    'activeOrders',
    new Map<string, Order>(),
  );

  // Historical orders (closed)
  private readonly _closedOrders$ = observableValue<Map<string, Order>>(
    'closedOrders',
    new Map<string, Order>(),
  );

  // Active positions
  private readonly _activePositions$ = observableValue<Map<string, Position>>(
    'activePositions',
    new Map<string, Position>(),
  );

  // Closed positions
  private readonly _closedPositions$ = observableValue<Map<string, Position>>(
    'closedPositions',
    new Map<string, Position>(),
  );

  // Map to store market data subscriptions for active positions
  private readonly _marketDataSubscriptions = new Map<string, IDisposable>();
  private readonly _subscriptionDisposables = this._register(new DisposableStore());

  // Public observables
  public readonly activeOrders$: IObservable<Map<string, Order>> = this._activeOrders$;
  public readonly closedOrders$: IObservable<Map<string, Order>> = this._closedOrders$;
  public readonly activePositions$: IObservable<Map<string, Position>> = this._activePositions$;
  public readonly closedPositions$: IObservable<Map<string, Position>> = this._closedPositions$;

  constructor(private readonly _data: IData) {
    super();
  }

  /**
   * Debug log helper that only logs when debug is enabled
   * @param message The message to log
   */
  private debugLog(message: string): void {
    if (debug) {
      console.log(`[TradeManager] ${message}`);
    }
  }

  /**
   * Calculate the total profit/loss from all closed positions
   * @returns The total P/L value
   */
  public calculateTotalPL(): number {
    const closedPositions = Array.from(this._closedPositions$.get().values());
    return closedPositions.reduce((total, position) => {
      return total + position.getPnL();
    }, 0);
  }

  /**
   * Manually opens a new position by creating and executing an order.
   * @param symbol The symbol to trade (e.g., 'QQQ').
   * @param isLong True for a long position (call), false for short (put).
   * @param size The quantity or size of the order.
   */
  public openPosition(symbol: string, isLong: boolean, size = 1): void {
    try {
      // Check if there's an active *opening* order already for this symbol
      const existingOrder = this.getActiveOrdersForSymbol(symbol).some(o => !o.isClosingPosition);
      if (existingOrder) {
        this.debugLog(`Position not opened: active opening order already exists for ${symbol}`);
        return;
      }

      // Create the new opening order
      const manualStrategyId = 'manual-trigger';
      const order = new Order(
        symbol,
        isLong,
        manualStrategyId,
        size,
        undefined,
        this._data,
        false, // Explicitly indicate this is an opening order
      );

      // Register listeners for this order
      const fillListener = order.onFilled(position => this.handleOrderFilled(order, position));
      const cancelListener = order.onCancelled(() => this.handleOrderCancelled(order));
      const disposeListeners = () => {
        fillListener.dispose();
        cancelListener.dispose();
      };
      // Use once for automatic disposal after firing
      Event.once(order.onFilled)(disposeListeners);
      Event.once(order.onCancelled)(disposeListeners);

      // Add to active orders
      transaction(tx => {
        const activeOrders = new Map(this._activeOrders$.get());
        activeOrders.set(order.id, order);
        this._activeOrders$.set(activeOrders, tx);
      });

      // Execute the order
      order.execute().catch(error => {
        console.error(`Failed to execute opening order ${order.id}:`, error);
        // If execution fails immediately, we might need to remove it from active orders
        this.handleOrderCancelled(order);
      });

      this.debugLog(`Manual opening order created: ${order.id} (${isLong ? 'LONG' : 'SHORT'})`);
    } catch (error) {
      console.error(
        `Error in openPosition: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Manually closes an existing position by its ID.
   * @param positionId The ID of the position to close.
   */
  public closePositionById(positionId: string): void {
    const activePositions = this._activePositions$.get();
    const positionToClose = activePositions.get(positionId);

    if (!positionToClose) {
      this.debugLog(`Position not closed: position ${positionId} not found or not active.`);
      return;
    }

    // Check if there's already an active closing order for this position
    const existingClosingOrder = this.getActiveOrders().some(
      o => o.isClosingPosition && o.instrumentId === positionToClose.instrumentId,
    );
    if (existingClosingOrder) {
      this.debugLog(
        `Position not closed: active closing order already exists for position ${positionId}`,
      );
      return;
    }

    try {
      // Create a closing order
      const manualStrategyId = 'manual-trigger';
      const order = new Order(
        positionToClose.symbol,
        !positionToClose.isLong, // The closing order is the opposite direction
        manualStrategyId,
        positionToClose.quantity,
        positionToClose.instrumentId,
        this._data,
        true, // Explicitly indicate this is a closing order
      );

      // Register listeners
      const fillListener = order.onFilled(() => this.handleOrderFilled(order));
      const cancelListener = order.onCancelled(() => this.handleOrderCancelled(order));
      const disposeListeners = () => {
        fillListener.dispose();
        cancelListener.dispose();
      };
      // Use once for automatic disposal after firing
      Event.once(order.onFilled)(disposeListeners);
      Event.once(order.onCancelled)(disposeListeners);

      // Add to active orders
      transaction(tx => {
        const activeOrders = new Map(this._activeOrders$.get());
        activeOrders.set(order.id, order);
        this._activeOrders$.set(activeOrders, tx);
      });

      // Execute the order
      order.execute().catch(error => {
        console.error(`Failed to execute closing order ${order.id}:`, error);
        this.handleOrderCancelled(order);
      });

      this.debugLog(`Created manual closing order ${order.id} for position ${positionId}`);
    } catch (error) {
      console.error(`Failed to create closing order for position ${positionId}:`, error);
    }
  }

  /**
   * Handles when an order is filled (both opening and closing).
   */
  private handleOrderFilled(order: Order, position?: Position): void {
    // If a position is provided, it means an *opening* order was filled.
    if (position !== undefined) {
      transaction(tx => {
        // Add position to active positions
        const activePositions = new Map(this._activePositions$.get());
        activePositions.set(position.id, position);
        this._activePositions$.set(activePositions, tx);

        // Move order from active to closed orders
        const activeOrders = new Map(this._activeOrders$.get());
        const closedOrders = new Map(this._closedOrders$.get());
        if (activeOrders.delete(order.id)) {
          closedOrders.set(order.id, order);
          this._activeOrders$.set(activeOrders, tx);
          this._closedOrders$.set(closedOrders, tx);
          this.debugLog(`Opening order ${order.id} moved to closed.`);
        } else {
          this.debugLog(`Warning: Filled opening order ${order.id} not found in active orders.`);
        }
      });
      this.debugLog(
        `Position opened: ${position.id} for symbol ${position.symbol} via order ${order.id}`,
      );
      // Subscribe to market data for the newly opened position
      this.subscribeToMarketData(position);
    }
    // Otherwise, it means a *closing* order was filled.
    else {
      // Find the active position that this closing order corresponds to.
      // The closing order should have the instrumentId of the position it's closing.
      const activePositions = this._activePositions$.get();
      const matchingPosition = Array.from(activePositions.values()).find(
        p => p.instrumentId === order.instrumentId,
      );

      if (matchingPosition) {
        // Unsubscribe from market data before closing the position
        this.unsubscribeFromMarketData(matchingPosition.id);

        transaction(tx => {
          // Close the position using data from the filled closing order
          matchingPosition.close(order.exitReason || ExitReason.MANUAL, order.executionPrice);

          // Move position from active to closed positions
          const updatedActivePositions = new Map(activePositions);
          const closedPositions = new Map(this._closedPositions$.get());
          if (updatedActivePositions.delete(matchingPosition.id)) {
            closedPositions.set(matchingPosition.id, matchingPosition);
            this._activePositions$.set(updatedActivePositions, tx);
            this._closedPositions$.set(closedPositions, tx);
            this.debugLog(`Position ${matchingPosition.id} moved to closed.`);
          } else {
            this.debugLog(
              `Warning: Closed position ${matchingPosition.id} not found in active positions.`,
            );
          }

          // Move the closing order from active to closed orders
          const activeOrders = new Map(this._activeOrders$.get());
          const closedOrders = new Map(this._closedOrders$.get());
          if (activeOrders.delete(order.id)) {
            closedOrders.set(order.id, order);
            this._activeOrders$.set(activeOrders, tx);
            this._closedOrders$.set(closedOrders, tx);
            this.debugLog(`Closing order ${order.id} moved to closed.`);
          } else {
            this.debugLog(`Warning: Filled closing order ${order.id} not found in active orders.`);
          }
        });

        this.debugLog(
          `Position closed: ${matchingPosition.id} for symbol ${matchingPosition.symbol} via order ${order.id}`,
        );

        // Calculate and log total P/L after position closure
        const totalPL = this.calculateTotalPL();
        this.debugLog(`Total P/L from closed positions: $${totalPL.toFixed(2)}`);
      } else {
        // This case might happen if the position was somehow closed or removed before the order filled confirmation arrived.
        this.debugLog(
          `No matching active position found for closing order ${order.id} (Instrument: ${order.instrumentId}). Moving order to closed.`,
        );
        // Still move the order to closed even if the position wasn't found active
        transaction(tx => {
          const activeOrders = new Map(this._activeOrders$.get());
          const closedOrders = new Map(this._closedOrders$.get());
          if (activeOrders.delete(order.id)) {
            closedOrders.set(order.id, order);
            this._activeOrders$.set(activeOrders, tx);
            this._closedOrders$.set(closedOrders, tx);
          }
        });
      }
    }
  }

  /**
   * Handles when an order is cancelled (could be opening or closing).
   */
  private handleOrderCancelled(order: Order): void {
    transaction(tx => {
      const activeOrders = new Map(this._activeOrders$.get());
      // Only remove if it exists in active orders
      if (activeOrders.delete(order.id)) {
        this._activeOrders$.set(activeOrders, tx);
        this.debugLog(`Order cancelled and removed from active: ${order.id}`);
      } else {
        this.debugLog(
          `Order cancellation received for ${order.id}, but it was not found in active orders.`,
        );
      }
    });
  }

  /**
   * Subscribes to market data updates for a given position.
   * @param position The position to monitor market data for.
   */
  private subscribeToMarketData(position: Position): void {
    if (!position.instrumentId || !this._data) {
      this.debugLog(
        `Cannot subscribe to market data for position ${position.id}: Missing instrumentId or data service.`,
      );
      return;
    }

    // Avoid duplicate subscriptions
    if (this._marketDataSubscriptions.has(position.id)) {
      this.debugLog(`Already subscribed to market data for position ${position.id}.`);
      return;
    }

    const optionChain = this._data.getOptionChain(position.symbol);
    if (!optionChain) {
      this.debugLog(`Cannot subscribe: Option chain not found for symbol ${position.symbol}.`);
      return;
    }

    this.debugLog(
      `Subscribing to market data for position ${position.id} (${position.instrumentId})`,
    );

    // Use autorun to react to marketData$ changes
    const subscription = autorun(reader => {
      const marketDataMap = optionChain.marketData$.read(reader);
      const quote = marketDataMap.get(position.instrumentId!);

      if (quote) {
        // For calculating P/L of an open position (Call or Put),
        // use the BID price (what you could sell it for)
        const bidPrice = parseFloat(quote.bid_price ?? 'NaN');
        const askPrice = parseFloat(quote.ask_price ?? 'NaN'); // Keep for fallback
        let currentMarkPrice: number | undefined;

        if (!isNaN(bidPrice) && bidPrice > 0) {
          // Prefer valid bid price
          currentMarkPrice = bidPrice;
        } else if (!isNaN(askPrice) && !isNaN(bidPrice)) {
          // Fallback to mid-price if bid is invalid/zero but ask is valid
          currentMarkPrice = (askPrice + bidPrice) / 2;
        }

        if (currentMarkPrice !== undefined && currentMarkPrice !== position.currentPrice) {
          // Update the position's price and trigger observable update
          transaction(tx => {
            position.updateCurrentPrice(currentMarkPrice!);
            // Create a new map to trigger updates in observers
            const updatedPositions = new Map(this._activePositions$.get());
            this._activePositions$.set(updatedPositions, tx);
          });
        }
      }
    });

    this._marketDataSubscriptions.set(position.id, subscription);
    this._subscriptionDisposables.add(subscription);
  }

  /**
   * Unsubscribes from market data updates for a position.
   * @param positionId The ID of the position to unsubscribe.
   */
  private unsubscribeFromMarketData(positionId: string): void {
    const subscription = this._marketDataSubscriptions.get(positionId);
    if (subscription) {
      this.debugLog(`Unsubscribing from market data for position ${positionId}`);
      subscription.dispose();
      this._marketDataSubscriptions.delete(positionId);
    }
  }

  /**
   * Get all active orders
   */
  public getActiveOrders(): Order[] {
    return Array.from(this._activeOrders$.get().values());
  }

  /**
   * Get all closed orders
   */
  public getClosedOrders(): Order[] {
    return Array.from(this._closedOrders$.get().values());
  }

  /**
   * Get active orders for a specific symbol
   */
  public getActiveOrdersForSymbol(symbol: string): Order[] {
    return this.getActiveOrders().filter(order => order.symbol === symbol);
  }

  /**
   * Check if there's an active order for a symbol
   */
  public hasActiveOrderForSymbol(symbol: string): boolean {
    return this.getActiveOrdersForSymbol(symbol).length > 0;
  }

  /**
   * Get all active positions
   */
  public getActivePositions(): Position[] {
    return Array.from(this._activePositions$.get().values());
  }

  /**
   * Get all active positions for a specific symbol
   */
  public getActivePositionsForSymbol(symbol: string): Position[] {
    return this.getActivePositions().filter(position => position.symbol === symbol);
  }

  /**
   * Reset the trade manager state.
   * This will clear all active/closed orders and positions.
   * Note: This currently doesn't cancel in-flight orders.
   */
  public reset(): void {
    this.debugLog('Resetting TradeManager...');

    // Unsubscribe from all market data
    this._marketDataSubscriptions.forEach((subscription, positionId) => {
      this.debugLog(`Unsubscribing position ${positionId} during reset`);
      subscription.dispose();
    });
    this._marketDataSubscriptions.clear();

    const activeOrders = this.getActiveOrders();
    if (activeOrders.length > 0) {
      this.debugLog(
        `Warning: Resetting with ${activeOrders.length} active orders. These will be cleared without cancellation.`,
      );
    }

    // Clear all state
    transaction(tx => {
      this._activeOrders$.set(new Map<string, Order>(), tx);
      this._closedOrders$.set(new Map<string, Order>(), tx);
      this._activePositions$.set(new Map<string, Position>(), tx);
      this._closedPositions$.set(new Map<string, Position>(), tx);
    });

    this.debugLog('TradeManager reset complete.');
  }

  override dispose(): void {
    this.debugLog('Disposing TradeManager...');

    // Clean up all subscriptions
    this._subscriptionDisposables.dispose();
    this._marketDataSubscriptions.clear();

    super.dispose();
    this.debugLog('TradeManager disposed.');
  }
}
