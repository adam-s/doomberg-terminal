import { useState, useEffect } from 'react';
import { autorun } from 'vs/base/common/observable';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { useService } from '@src/side-panel/hooks/useService';
import { ITradingGameService } from '@src/services/tradingGame/tradingGame.service';
import { Position } from '@src/services/tradingGame/position';

/**
 * A hook that provides access to closed positions from TradeManager
 * Used by the Ledger component to display trading history
 */
export function useClosedPositions(): Position[] {
  const tradingGameService = useService(ITradingGameService);
  const tradeManager = tradingGameService.tradeManager;
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);

  useEffect(() => {
    const disposables = new DisposableStore();

    // Subscribe to closed positions observable
    disposables.add(
      autorun(reader => {
        const positionsMap = tradeManager.closedPositions$.read(reader);
        setClosedPositions(Array.from(positionsMap.values()));
      }),
    );

    // Initialize with current values
    setClosedPositions(Array.from(tradeManager.closedPositions$.get().values()));

    return () => {
      disposables.dispose();
    };
  }, [tradeManager]);

  return closedPositions;
}
