import { useMemo, useCallback, useState, useEffect } from 'react';
import { useService } from '@src/side-panel/hooks/useService';
import { autorun } from 'vs/base/common/observable';
import { DisposableStore } from 'vs/base/common/lifecycle';
import {
  ITradingGameService,
  TradingGameServiceState,
} from '@src/services/tradingGame/tradingGame.service';
import { Position } from '@src/services/tradingGame/position';
import { Order } from '@src/services/tradingGame/order';

// Define the structure of the state returned by the hook
export interface TradingGameHookState {
  status: TradingGameServiceState;
  activePositions: Position[];
  closedPositions: Position[];
  activeOrders: Order[];
  closedOrders: Order[];
  totalProfitLoss: number;
  isLoading: boolean; // To track if an action (buy/sell) is in progress
}

// Define the actions returned by the hook
export interface TradingGameHookActions {
  buyPosition: (symbol: string, isLong: boolean, size?: number) => void;
  sellPosition: (positionId: string) => void;
  resetGame: () => void;
}

export const useTradingGame = (): [TradingGameHookState, TradingGameHookActions] => {
  const tradingGameService = useService(ITradingGameService);
  const tradeManager = tradingGameService.tradeManager;

  // State to track loading during buy/sell operations
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<TradingGameServiceState>(TradingGameServiceState.IDLE);
  const [activePositions, setActivePositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [closedOrders, setClosedOrders] = useState<Order[]>([]);

  // Update states when observables change
  useEffect(() => {
    const disposables = new DisposableStore();

    // Use autorun to subscribe to observable changes
    disposables.add(
      autorun(reader => {
        const newStatus = tradingGameService.status$.read(reader);
        setStatus(newStatus);
      }),
    );

    disposables.add(
      autorun(reader => {
        const positionsMap = tradeManager.activePositions$.read(reader);
        setActivePositions(Array.from(positionsMap.values()));
      }),
    );

    disposables.add(
      autorun(reader => {
        const positionsMap = tradeManager.closedPositions$.read(reader);
        setClosedPositions(Array.from(positionsMap.values()));
      }),
    );

    disposables.add(
      autorun(reader => {
        const ordersMap = tradeManager.activeOrders$.read(reader);
        setActiveOrders(Array.from(ordersMap.values()));
      }),
    );

    disposables.add(
      autorun(reader => {
        const ordersMap = tradeManager.closedOrders$.read(reader);
        setClosedOrders(Array.from(ordersMap.values()));
      }),
    );

    // Initialize values
    setStatus(tradingGameService.status$.get());
    setActivePositions(Array.from(tradeManager.activePositions$.get().values()));
    setClosedPositions(Array.from(tradeManager.closedPositions$.get().values()));
    setActiveOrders(Array.from(tradeManager.activeOrders$.get().values()));
    setClosedOrders(Array.from(tradeManager.closedOrders$.get().values()));

    return () => {
      disposables.dispose();
    };
  }, [tradingGameService, tradeManager]);

  // Calculate total P/L from closed positions
  const totalProfitLoss = useMemo(() => {
    return closedPositions.reduce((total, position) => total + position.getPnL(), 0);
  }, [closedPositions]);

  // Effect to manage loading state based on active orders
  useEffect(() => {
    setIsLoading(activeOrders.length > 0);
  }, [activeOrders]);

  // Action handlers using useCallback
  const buyPosition = useCallback(
    (symbol: string, isLong: boolean, size = 1) => {
      if (isLoading) return; // Prevent multiple actions while one is processing
      tradeManager.openPosition(symbol, isLong, size);
    },
    [tradeManager, isLoading],
  );

  const sellPosition = useCallback(
    (positionId: string) => {
      if (isLoading) return; // Prevent multiple actions
      tradeManager.closePositionById(positionId);
    },
    [tradeManager, isLoading],
  );

  const resetGame = useCallback(() => {
    tradeManager.reset();
  }, [tradeManager]);

  // Start the service if it's idle
  useEffect(() => {
    if (status === TradingGameServiceState.IDLE) {
      tradingGameService.start().catch(console.error);
    }
  }, [status, tradingGameService]);

  // Assemble the state and actions to return
  const state: TradingGameHookState = {
    status,
    activePositions,
    closedPositions,
    activeOrders,
    closedOrders,
    totalProfitLoss,
    isLoading,
  };

  const actions: TradingGameHookActions = {
    buyPosition,
    sellPosition,
    resetGame,
  };

  return [state, actions];
};
