import { useState, useEffect, useCallback, useMemo } from 'react';

// --- Interfaces and Enums ---

export interface SimulationSummary {
  averageTrades: number;
  averageWinRate: number;
  averagePnL: number;
}

export enum PanelId {
  Left = 'left',
  Right = 'right',
}

// Define the possible position statuses
export type PositionStatus = 'long' | 'short' | 'none';

// Define trend direction
export enum TrendDirection {
  Up = 'up',
  Down = 'down',
  Neutral = 'neutral',
}

interface SimulationSummaryState {
  summaries: Record<PanelId, SimulationSummary | null>;
  pnlHistories: Record<PanelId, number[]>;
  activePositions: Record<PanelId, PositionStatus>; // Add state for active position status
}

export interface DifferenceDataPoint {
  index: number;
  difference: number;
}

interface SimulationSummaryHookResult extends SimulationSummaryState {
  setSummary: (panelId: PanelId, summary: SimulationSummary | null) => void;
  addPnlHistoryEntry: (panelId: PanelId, pnlValue: number) => void;
  clearPnlHistory: (panelId: PanelId) => void;
  setActivePosition: (panelId: PanelId, status: PositionStatus) => void; // Add setter function
  differenceData: DifferenceDataPoint[];
  differenceTrend: TrendDirection; // Add trend direction
}

// --- Constants ---

export const DEFAULT_HISTORY: readonly number[] = Object.freeze([0, 0]); // Use readonly and freeze

const SMOOTHING_WINDOW_SIZE = 15;

// --- Global State Management ---

const initialState: SimulationSummaryState = {
  summaries: {
    [PanelId.Left]: null,
    [PanelId.Right]: null,
  },
  pnlHistories: {
    [PanelId.Left]: [...DEFAULT_HISTORY],
    [PanelId.Right]: [...DEFAULT_HISTORY],
  },
  activePositions: {
    // Initialize active positions
    [PanelId.Left]: 'none',
    [PanelId.Right]: 'none',
  },
};

// Global state store (simple implementation)
let globalState: SimulationSummaryState = { ...initialState };
const listeners: Set<() => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

// Simple Moving Average smoothing for difference data
function calculateSMA(data: DifferenceDataPoint[], windowSize: number): DifferenceDataPoint[] {
  if (windowSize <= 1 || data.length < windowSize) {
    return data;
  }
  const smoothedData: DifferenceDataPoint[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);
    const window = data.slice(start, end);
    const sum = window.reduce((acc, point) => acc + point.difference, 0);
    const avg = sum / window.length;
    smoothedData.push({ index: data[i].index, difference: avg });
  }
  return smoothedData;
}

// --- Custom Hook ---

export const useSimulationSummary = (): SimulationSummaryHookResult => {
  // Local state initialized with the current global state
  // This ensures the component has the latest state on initial render
  const [localState, setLocalState] = useState<SimulationSummaryState>(globalState);

  useEffect(() => {
    // Define the listener function for this specific component instance
    const listener = (): void => {
      // When global state changes, update the local state
      // Create a new object reference to trigger re-render
      setLocalState({ ...globalState });
    };

    // Subscribe to global state changes on mount
    listeners.add(listener);

    // Unsubscribe on unmount to prevent memory leaks
    return () => {
      listeners.delete(listener);
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  // --- Action Callbacks ---

  const updateState = useCallback((newState: Partial<SimulationSummaryState>) => {
    globalState = { ...globalState, ...newState };
    setLocalState(globalState); // Update local state
    notifyListeners(); // Notify other instances
  }, []);

  const setSummary = useCallback(
    (panelId: PanelId, summary: SimulationSummary | null): void => {
      updateState({ summaries: { ...globalState.summaries, [panelId]: summary } });
    },
    [updateState],
  );

  const addPnlHistoryEntry = useCallback(
    (panelId: PanelId, pnlValue: number): void => {
      // Basic validation
      if (typeof pnlValue !== 'number' || isNaN(pnlValue)) {
        console.warn('Invalid PnL value provided:', pnlValue);
        return;
      }

      const currentHistory = globalState.pnlHistories[panelId] || [];
      // Keep only the last N entries if needed, e.g., 50
      const newHistory = [...currentHistory, pnlValue].slice(-50);
      updateState({ pnlHistories: { ...globalState.pnlHistories, [panelId]: newHistory } });
    },
    [updateState],
  );

  const clearPnlHistory = useCallback(
    (panelId: PanelId): void => {
      updateState({
        pnlHistories: { ...globalState.pnlHistories, [panelId]: [...DEFAULT_HISTORY] },
      });
    },
    [updateState],
  );

  // Function to set the active position status for a panel
  const setActivePosition = useCallback(
    (panelId: PanelId, status: PositionStatus) => {
      // Only update if the status has actually changed
      if (globalState.activePositions[panelId] !== status) {
        updateState({ activePositions: { ...globalState.activePositions, [panelId]: status } });
      }
    },
    [updateState],
  );

  // --- Derived Data Calculation ---

  // Calculate and smooth the difference data
  const differenceData = useMemo(() => {
    const leftHistory = localState.pnlHistories[PanelId.Left] || []; // Use localState here
    const rightHistory = localState.pnlHistories[PanelId.Right] || []; // Use localState here
    const maxLength = Math.max(leftHistory.length, rightHistory.length);
    if (maxLength === 0) return [];

    const rawData: DifferenceDataPoint[] = [];
    for (let i = 0; i < maxLength; i++) {
      const leftValue =
        leftHistory[i] ?? (leftHistory.length > 0 ? leftHistory[leftHistory.length - 1] : 0);
      const rightValue =
        rightHistory[i] ?? (rightHistory.length > 0 ? rightHistory[rightHistory.length - 1] : 0);
      rawData.push({
        index: i,
        difference: leftValue - rightValue,
      });
    }
    return calculateSMA(rawData, SMOOTHING_WINDOW_SIZE);
  }, [localState.pnlHistories]); // Change dependency to localState.pnlHistories

  // Calculate the trend of the difference data
  const differenceTrend = useMemo((): TrendDirection => {
    // Use the last 5 points for trend calculation
    const TREND_POINTS = 5;
    if (differenceData.length < TREND_POINTS) {
      return TrendDirection.Neutral;
    }

    const lastPoints = differenceData.slice(-TREND_POINTS);
    const firstPoint = lastPoints[0];
    const lastPoint = lastPoints[lastPoints.length - 1];

    const diff = lastPoint.difference - firstPoint.difference;
    const threshold = 0.001;

    if (diff > threshold) {
      return TrendDirection.Up;
    }
    if (diff < -threshold) {
      return TrendDirection.Down;
    }
    return TrendDirection.Neutral;
  }, [differenceData]); // Recalculate when differenceData changes

  // --- Return Value ---

  // Use useMemo to memoize the result object, preventing unnecessary re-renders
  // The dependencies include the local state parts and the memoized callbacks
  return useMemo(
    () => ({
      summaries: localState.summaries,
      pnlHistories: localState.pnlHistories,
      activePositions: localState.activePositions, // Return the active position state
      differenceData,
      differenceTrend,
      setSummary,
      addPnlHistoryEntry,
      clearPnlHistory,
      setActivePosition,
    }),
    [
      localState.summaries,
      localState.pnlHistories,
      localState.activePositions,
      differenceData,
      differenceTrend,
      setSummary,
      addPnlHistoryEntry,
      clearPnlHistory,
      setActivePosition,
    ],
  );
};

// Function to reset all summaries and histories (optional, e.g., for global reset)
export const resetAllSimulationSummaries = () => {
  globalState = { ...initialState };
  notifyListeners();
};
