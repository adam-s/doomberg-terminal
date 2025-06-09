import { Disposable } from 'vs/base/common/lifecycle';
import { observableValue, IObservable, transaction, autorun } from 'vs/base/common/observable';

import { Settings, StrategySettings } from './settings';
import { IData } from './data';
import { Strategy } from './strategy';
import { ExitReason } from './types';
import { Position } from './position';
import { Order } from './order';

const debug = true;

/**
 * Manages trading orders and positions for the strategy
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

  // Collection of all strategies (active and inactive)
  private readonly _strategies = new Map<string, Strategy>();

  // Current active strategy that can open orders
  private _activeStrategy?: Strategy;

  // Track the last settings to compare for changes
  private _lastSettings?: StrategySettings;

  // Public observables
  public readonly activeOrders$: IObservable<Map<string, Order>> = this._activeOrders$;
  public readonly closedOrders$: IObservable<Map<string, Order>> = this._closedOrders$;
  public readonly activePositions$: IObservable<Map<string, Position>> = this._activePositions$;
  public readonly closedPositions$: IObservable<Map<string, Position>> = this._closedPositions$;

  constructor(
    private readonly _data: IData,
    private readonly _settings: Settings,
  ) {
    super();

    // Create initial strategy
    this.createNewActiveStrategy();

    // Use autorun to listen for settings changes
    this._register(
      autorun(reader => {
        const currentSettings = this._settings.getConsolidatedSettings$().read(reader);

        // Don't create a new strategy on initial run
        if (
          this._lastSettings &&
          this._settings.hasSettingsChanged(this._lastSettings, currentSettings)
        ) {
          this.debugLog('Settings changed, creating new strategy...');
          this.createNewActiveStrategy();
        }

        // Save the current settings for future comparison
        this._lastSettings = { ...currentSettings };
      }),
    );
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
  private calculateTotalPL(): number {
    const closedPositions = Array.from(this._closedPositions$.get().values());
    return closedPositions.reduce((total, position) => {
      return total + position.getPnL();
    }, 0);
  }

  /**
   * Creates a new active strategy based on current settings while preserving old strategies
   */
  private createNewActiveStrategy(): void {
    // Get latest consolidated settings
    const strategySettings = this._settings.getConsolidatedSettings$().get();

    // Create new strategy
    const newStrategy = new Strategy(this._data, strategySettings);

    // Register order event listeners for the new strategy
    this._register(
      newStrategy.onPositionOpened(data => this.handleOrderOpened(data.strategyId, data.settings)),
    );

    this._register(newStrategy.onPositionClosed(data => this.handleOrderClosed(data.strategyId)));

    // Start the new strategy
    newStrategy.start().catch(error => console.error('Failed to start strategy:', error));

    // If there's an existing active strategy, don't dispose it but just demote it
    // so it can continue managing its open orders until they close naturally
    if (this._activeStrategy) {
      this.debugLog(
        `Previous active strategy ${this._activeStrategy.id} demoted to inactive status`,
      );
    }

    // Add new strategy to strategies collection
    this._strategies.set(newStrategy.id, newStrategy);

    // Set as active strategy
    this._activeStrategy = newStrategy;

    this.debugLog(`Created new active strategy: ${newStrategy.id}`);
  }

  /**
   * Handles when a strategy signals to open a new trade
   * @param strategyId The ID of the strategy requesting the order
   * @param settings The settings of the strategy requesting the order
   */
  private handleOrderOpened(strategyId: string, settings: StrategySettings): void {
    try {
      // Get symbol from settings instead of hardcoding
      const symbol = settings.symbol || 'QQQ';

      // Check if we already have an active order for this symbol
      if (this.hasActiveOrderForSymbol(symbol)) {
        this.debugLog(`Order not opened: active order already exists for ${symbol}`);
        return;
      }

      // Find the strategy
      const strategy = this._strategies.get(strategyId);
      if (!strategy) {
        this.debugLog(`Order not opened: strategy ${strategyId} not found`);
        return;
      }

      // Get the position intent from the strategy to determine if it's long or short
      const strategyPositionIntent = strategy.getPositionIntent();
      if (!strategyPositionIntent) {
        this.debugLog(`Order not opened: no position intent found in strategy ${strategyId}`);
        return;
      }

      try {
        // Get instrument ID for this symbol
        const instrumentId = this.getInstrumentIdForSymbol(symbol);

        // Create the new order based on strategy's position intent
        const order = new Order(
          symbol,
          strategyPositionIntent.isLong,
          strategyId,
          settings,
          1, // Size - adjust as needed
          instrumentId,
          this._data,
          false, // Explicitly indicate this is an opening order
        );

        // Register listeners for this order
        this._register(order.onFilled(position => this.handleOrderFilled(order, position)));
        this._register(order.onCancelled(() => this.handleOrderCancelled(order)));

        // Add to active orders
        transaction(tx => {
          const activeOrders = new Map(this._activeOrders$.get());
          activeOrders.set(order.id, order);
          this._activeOrders$.set(activeOrders, tx);
        });

        // Execute the order
        order.execute().catch(error => {
          console.error('Failed to execute order:', error);
        });

        this.debugLog(
          `New order created: ${order.id} (${strategyPositionIntent.isLong ? 'LONG' : 'SHORT'})`,
        );

        // Perform cleanup to remove unused strategies
        // this.cleanupUnusedStrategies();
      } catch (error) {
        this.debugLog(
          `Failed to create order: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      console.error(
        `Error in handleOrderOpened: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handles when an order is filled
   */
  private handleOrderFilled(order: Order, position?: Position): void {
    // If a position is provided, treat this as an opening order (regardless of isLong)
    if (position !== undefined) {
      transaction(tx => {
        // Add position to active positions
        const activePositions = new Map(this._activePositions$.get());
        activePositions.set(position.id, position);
        this._activePositions$.set(activePositions, tx);

        // Move order to closed orders
        const activeOrders = new Map(this._activeOrders$.get());
        const closedOrders = new Map(this._closedOrders$.get());

        activeOrders.delete(order.id);
        closedOrders.set(order.id, order);

        this._activeOrders$.set(activeOrders, tx);
        this._closedOrders$.set(closedOrders, tx);
      });

      this.debugLog(`Position opened: ${position.id} for symbol ${position.symbol}`);
    }
    // Otherwise, treat it as a closing order
    else {
      // Find position to close - match by instrumentId and the opposite of order.isLong
      const activePositions = this._activePositions$.get();
      const matchingPosition = Array.from(activePositions.values()).find(
        p => p.instrumentId === order.instrumentId,
      );

      if (matchingPosition) {
        transaction(tx => {
          // Close the position
          matchingPosition.close(order.exitReason || ExitReason.SYSTEM, order.executionPrice);

          // Move position to closed positions
          const updatedActivePositions = new Map(activePositions);
          const closedPositions = new Map(this._closedPositions$.get());

          updatedActivePositions.delete(matchingPosition.id);
          closedPositions.set(matchingPosition.id, matchingPosition);

          this._activePositions$.set(updatedActivePositions, tx);
          this._closedPositions$.set(closedPositions, tx);

          // Move order to closed orders
          const activeOrders = new Map(this._activeOrders$.get());
          const closedOrders = new Map(this._closedOrders$.get());

          activeOrders.delete(order.id);
          closedOrders.set(order.id, order);

          this._activeOrders$.set(activeOrders, tx);
          this._closedOrders$.set(closedOrders, tx);
        });

        this.debugLog(
          `Position closed: ${matchingPosition.id} for symbol ${matchingPosition.symbol}`,
        );

        // Calculate and log total P/L after position closure
        const totalPL = this.calculateTotalPL();
        this.debugLog(`Total P/L from closed positions: $${totalPL.toFixed(2)}`);
      } else {
        this.debugLog(`No matching position found to close for order ${order.id}`);
      }
    }
  }

  /**
   * Handles when a strategy signals to close an order
   * @param exitReason The reason for order closure from strategy
   * @param strategyId The ID of the strategy closing the order
   */
  private handleOrderClosed(strategyId: string): void {
    // Find active positions for this strategy
    const activePositions = this._activePositions$.get();
    const strategyPositions = Array.from(activePositions.values()).filter(
      position => position.strategyId === strategyId,
    );

    if (strategyPositions.length === 0) {
      this.debugLog(`No active positions to close for strategy ${strategyId}`);
      return;
    }

    // For each position, create a sell order
    for (const position of strategyPositions) {
      try {
        const order = new Order(
          position.symbol,
          position.isLong,
          strategyId,
          this._settings.getConsolidatedSettings$().get(),
          position.quantity,
          position.instrumentId,
          this._data,
          true, // Explicitly indicate this is a closing order
        );

        // Register listeners
        // Fix: Pass undefined explicitly as the argument when necessary
        this._register(order.onFilled(position => this.handleOrderFilled(order, position)));
        this._register(order.onCancelled(() => this.handleOrderCancelled(order)));

        // Add to active orders
        transaction(tx => {
          const activeOrders = new Map(this._activeOrders$.get());
          activeOrders.set(order.id, order);
          this._activeOrders$.set(activeOrders, tx);
        });

        // Execute the order
        order.execute().catch(error => {
          console.error('Failed to execute sell order:', error);
        });

        this.debugLog(`Created sell order ${order.id} to close position ${position.id}`);
      } catch (error) {
        console.error(`Failed to create sell order for position ${position.id}:`, error);
      }
    }

    // Perform cleanup to remove unused strategies
    // this.cleanupUnusedStrategies();
  }

  /**
   * Handles when an order is cancelled
   */
  private handleOrderCancelled(order: Order): void {
    transaction(tx => {
      const activeOrders = new Map(this._activeOrders$.get());
      activeOrders.delete(order.id);
      this._activeOrders$.set(activeOrders, tx);
    });

    this.debugLog(`Order cancelled: ${order.id}`);
  }

  /**
   * Clean up strategies that have no open orders
   */
  private cleanupUnusedStrategies(): void {
    // Skip the active strategy
    if (!this._activeStrategy) return;

    const activeStrategyId = this._activeStrategy.id;
    const activeOrders = this._activeOrders$.get();

    // Get all strategy IDs with active orders
    const usedStrategyIds = new Set(
      Array.from(activeOrders.values()).map(order => order.strategyId),
    );

    // Dispose strategies with no active orders (except the current active strategy)
    for (const [strategyId, strategy] of this._strategies.entries()) {
      if (strategyId !== activeStrategyId && !usedStrategyIds.has(strategyId)) {
        this.debugLog(`Disposing unused strategy: ${strategyId}`);
        strategy.dispose();
        this._strategies.delete(strategyId);
      }
    }
  }

  /**
   * Get all active orders
   */
  public getActiveOrders(): Order[] {
    return Array.from(this._activeOrders$.get().values());
  }

  /**
   * Get all active strategies
   */
  public getActiveStrategies(): Strategy[] {
    return Array.from(this._strategies.values());
  }

  /**
   * Get the currently active strategy that can open orders
   */
  public getActiveStrategy(): Strategy | undefined {
    return this._activeStrategy;
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
   * Gets the instrument ID for the given symbol
   */
  private getInstrumentIdForSymbol(symbol: string): string {
    // Mock implementation - replace with actual logic
    return `${symbol}-INSTRUMENT-ID`;
  }

  /**
   * Reset the order manager
   * This will close all orders and dispose all strategies
   */
  public reset(): void {
    // Close all orders
    transaction(tx => {
      this._activeOrders$.set(new Map<string, Order>(), tx);
      this._closedOrders$.set(new Map<string, Order>(), tx);
      this._activePositions$.set(new Map<string, Position>(), tx);
      this._closedPositions$.set(new Map<string, Position>(), tx);
    });

    // Dispose all strategies
    for (const [, strategy] of this._strategies) {
      strategy.dispose();
    }
    this._strategies.clear();
    this._activeStrategy = undefined;

    // Create a new active strategy
    this.createNewActiveStrategy();
  }

  override dispose(): void {
    // Dispose all strategies
    for (const [, strategy] of this._strategies) {
      strategy.dispose();
    }

    super.dispose();
  }
}
