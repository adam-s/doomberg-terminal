import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSimulation } from './useSimulation';
import { IPerformanceReport } from '@src/services/simulators/tradeSimulator/strategy/baseStrategy';
import {
  FilterValues,
  FilterBounds,
  SortCriteria,
  SortDirection,
  TradeDirectionFilter,
} from '../../components/tradeSimulator/PopupFilter'; // Add TradeDirectionFilter
import {
  PanelId,
  useSimulationSummary,
} from '@src/side-panel/hooks/simulation/useSimulationSummary';

// --- Pure Helper Functions ---

interface Bounds {
  min: number;
  max: number;
}

function safeBounds(min: number, max: number, step: number): Bounds {
  const safeMin = Number.isFinite(min) ? min : 0;
  let safeMax = Number.isFinite(max) ? max : safeMin + step;
  if (safeMax < safeMin) safeMax = safeMin;
  if (safeMax === safeMin && step > 0) safeMax = safeMin + step;
  if (safeMin === 0 && safeMax === 0 && step > 0) safeMax = step;
  return { min: safeMin, max: safeMax };
}

function calculateBounds(reports: IPerformanceReport[]): FilterBounds {
  if (!reports.length) {
    return {
      trades: { min: 0, max: 1 },
      winRate: { min: 0, max: 100 },
      avgPL: { min: 0, max: 1 },
    };
  }
  let minTrades = Infinity,
    maxTrades = -Infinity;
  let minAvgPL = Infinity,
    maxAvgPL = -Infinity;
  reports.forEach(report => {
    minTrades = Math.min(minTrades, report.trades);
    maxTrades = Math.max(maxTrades, report.trades);
    const avgProfit = report.trades > 0 ? report.averageTradeProfit : 0;
    minAvgPL = Math.min(minAvgPL, avgProfit);
    maxAvgPL = Math.max(maxAvgPL, avgProfit);
  });
  return {
    trades: safeBounds(minTrades, maxTrades, 1),
    winRate: { min: 0, max: 100 },
    avgPL: safeBounds(minAvgPL, maxAvgPL, 0.01),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function clampPair(pair: [number, number], bounds: Bounds): [number, number] {
  let v1 = clamp(pair[0], bounds.min, bounds.max);
  let v2 = clamp(pair[1], bounds.min, bounds.max);
  if (v1 > v2) [v1, v2] = [v2, v1];
  return [v1, v2];
}

function searchReports(reports: IPerformanceReport[], term: string): IPerformanceReport[] {
  if (!term) return reports;
  const lower = term.toLowerCase();
  return reports.filter(report => report.id.toLowerCase().includes(lower));
}

function filterReports(
  reports: IPerformanceReport[],
  filters: FilterValues,
  tradeDirectionFilter: TradeDirectionFilter,
): IPerformanceReport[] {
  return reports.filter(report => {
    const avgProfit = report.trades > 0 ? report.averageTradeProfit : 0;
    const meetsTrade = report.trades >= filters.trades[0];
    const meetsWinRate =
      report.winRate >= filters.winRate[0] && report.winRate <= filters.winRate[1];
    const meetsAvgPL = avgProfit >= filters.avgPL[0] && avgProfit <= filters.avgPL[1];

    let meetsDirection = false;
    switch (tradeDirectionFilter) {
      case TradeDirectionFilter.BOTH:
        meetsDirection = true;
        break;
      case TradeDirectionFilter.LONG:
        meetsDirection = report.id.toLowerCase().includes('long');
        break;
      case TradeDirectionFilter.SHORT:
        meetsDirection = report.id.toLowerCase().includes('short');
        break;
      default:
        meetsDirection = true;
    }

    return meetsTrade && meetsWinRate && meetsAvgPL && meetsDirection;
  });
}

function sortReports(
  reports: IPerformanceReport[],
  criteria: SortCriteria,
  direction: SortDirection,
): IPerformanceReport[] {
  const sorted = [...reports];
  sorted.sort((a, b) => {
    let compareA: number;
    let compareB: number;
    switch (criteria) {
      case SortCriteria.Trades:
        compareA = a.trades;
        compareB = b.trades;
        break;
      case SortCriteria.WinRate:
        compareA = a.winRate;
        compareB = b.winRate;
        break;
      case SortCriteria.AvgPL:
        compareA = a.trades > 0 ? a.averageTradeProfit : 0;
        compareB = b.trades > 0 ? b.averageTradeProfit : 0;
        break;
      case SortCriteria.TotalPL:
        compareA = a.pnl;
        compareB = b.pnl;
        break;
      case SortCriteria.Rank:
      default:
        compareA = a.pnl ?? -Infinity;
        compareB = b.pnl ?? -Infinity;
        break;
    }
    compareA = Number.isFinite(compareA)
      ? compareA
      : direction === SortDirection.Ascending
        ? Infinity
        : -Infinity;
    compareB = Number.isFinite(compareB)
      ? compareB
      : direction === SortDirection.Ascending
        ? Infinity
        : -Infinity;
    return direction === SortDirection.Ascending ? compareA - compareB : compareB - compareA;
  });
  return sorted;
}

function calculateSummary(reports: IPerformanceReport[]): SimulationSummary | null {
  if (reports.length === 0) return null;
  const totals = reports.reduce(
    (acc, report) => {
      acc.totalPnL += report.pnl;
      acc.totalWinRate += report.winRate;
      acc.totalTrades += report.trades;
      return acc;
    },
    { totalPnL: 0, totalWinRate: 0, totalTrades: 0 },
  );
  const count = reports.length;
  return {
    averagePnL: totals.totalPnL / count,
    averageWinRate: totals.totalWinRate / count,
    averageTrades: Math.round(totals.totalTrades / count),
  };
}

// --- Interfaces (Moved/Kept from useSimulation) ---
export interface SimulationSummary {
  averagePnL: number;
  averageWinRate: number;
  averageTrades: number;
}

export interface UseSimulationSearchResult {
  filteredAndSortedReports: IPerformanceReport[]; // Use IPerformanceReport
  summary: SimulationSummary | null;
  filterBounds: FilterBounds;
  filterValues: FilterValues;
  sortCriteria: SortCriteria;
  sortDirection: SortDirection;
  filtersManuallySet: boolean;
  tradeDirectionFilter: TradeDirectionFilter;
  setFilterValues: (values: FilterValues) => void;
  handleResetFilters: () => void;
  handleSetSort: (criteria: SortCriteria) => void;
  setFiltersManuallySet: (isSet: boolean) => void;
  setTradeDirectionFilter: (direction: TradeDirectionFilter) => void;
}

// --- Hook Definition ---
// Accept panelId as a parameter
export const useSimulationSearch = (
  searchTerm: string,
  panelId: PanelId,
): UseSimulationSearchResult => {
  // 1. Get base ranked data from useSimulation
  const { reports } = useSimulation();
  // 2. Get setSummary from useSimulationSummary
  const { setSummary } = useSimulationSummary();
  // 2. State for filtering, sorting, bounds (Moved from useSimulation)
  const [filterBounds, setFilterBounds] = useState<FilterBounds>({
    trades: { min: 0, max: 1 },
    winRate: { min: 0, max: 100 },
    avgPL: { min: 0, max: 1 },
  });
  const [filterValues, setFilterValues] = useState<FilterValues>({
    trades: [0, 1],
    winRate: [0, 100],
    avgPL: [0, 1],
  });
  const [filtersManuallySet, setFiltersManuallySet] = useState<boolean>(false);
  // Default sort by composite score (ranking)
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>(SortCriteria.Rank);
  const [sortDirection, setSortDirection] = useState<SortDirection>(SortDirection.Descending);
  const [tradeDirectionFilter, setTradeDirectionFilter] = useState<TradeDirectionFilter>(
    TradeDirectionFilter.BOTH,
  );

  // 3. Effect to calculate filter bounds and adjust values based on reports
  useEffect(() => {
    const newBounds = calculateBounds(reports);
    setFilterBounds(newBounds); // Update the bounds state first

    // Now, adjust filterValues based on the newBounds
    setFilterValues(prevValues => {
      if (!filtersManuallySet) {
        // If filters weren't manually set, reset them to the new full bounds
        return {
          trades: [newBounds.trades.min, newBounds.trades.max],
          winRate: [newBounds.winRate.min, newBounds.winRate.max],
          avgPL: [newBounds.avgPL.min, newBounds.avgPL.max],
        };
      } else {
        // If filters *were* manually set, adjust the existing values
        // Clamp all filter values within the new bounds.
        return {
          trades: [
            // Clamp the previously set lower bound within the new data's bounds.
            // This prevents the lower bound from dropping below the user's setting.
            clamp(prevValues.trades[0], newBounds.trades.min, newBounds.trades.max),
            // Always set the upper bound to the maximum of the new data range.
            newBounds.trades.max,
          ],
          // Clamp WinRate and AvgPL pairs to stay within the new bounds
          winRate: clampPair(prevValues.winRate, newBounds.winRate),
          avgPL: clampPair(prevValues.avgPL, newBounds.avgPL),
        };
      }
    });
    // Note: We depend on `reports` and `filtersManuallySet`.
    // `setFilterBounds` and `setFilterValues` are stable state setters.
  }, [reports, filtersManuallySet]);

  // 4. Memoize Filtered and Sorted Reports (Logic moved from useSimulation)
  const filteredAndSortedReports = useMemo(() => {
    // This calculation now correctly uses the potentially updated filterValues
    const searched = searchReports(reports, searchTerm);
    const filtered = filterReports(searched, filterValues, tradeDirectionFilter);
    return sortReports(filtered, sortCriteria, sortDirection);
  }, [reports, searchTerm, filterValues, sortCriteria, sortDirection, tradeDirectionFilter]);

  // 5. Memoize Summary Calculation (Logic moved from useSimulation)
  const summary = useMemo<SimulationSummary | null>(() => {
    return calculateSummary(filteredAndSortedReports);
  }, [filteredAndSortedReports]);

  // 6. Effect to update global summary for this panelId
  useEffect(() => {
    setSummary(panelId, summary);
  }, [panelId, summary, setSummary]);

  // 7. Callback Handlers (Moved from useSimulation)
  const handleSetSort = useCallback((criteria: SortCriteria) => {
    setSortCriteria(prevCriteria => {
      if (prevCriteria === criteria) {
        setSortDirection(prevDirection =>
          prevDirection === SortDirection.Descending
            ? SortDirection.Ascending
            : SortDirection.Descending,
        );
        return criteria;
      } else {
        setSortDirection(SortDirection.Descending); // Default to descending for new criteria
        return criteria;
      }
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    // Use the current filterBounds state when resetting
    setFilterValues({
      trades: [filterBounds.trades.min, filterBounds.trades.max],
      winRate: [filterBounds.winRate.min, filterBounds.winRate.max],
      avgPL: [filterBounds.avgPL.min, filterBounds.avgPL.max],
    });
    // Reset other filter/sort states
    setTradeDirectionFilter(TradeDirectionFilter.BOTH);
    setSortCriteria(SortCriteria.Rank); // Reset sort to default
    setSortDirection(SortDirection.Descending);
    setFiltersManuallySet(false); // Mark filters as not manually set
  }, [filterBounds]); // Depend on filterBounds

  // 8. Return state and handlers
  return {
    filteredAndSortedReports,
    summary,
    filterBounds,
    filterValues,
    sortCriteria,
    sortDirection,
    filtersManuallySet,
    tradeDirectionFilter,
    setFilterValues, // Pass through the state setter
    handleResetFilters,
    handleSetSort,
    setFiltersManuallySet, // Pass through the state setter
    setTradeDirectionFilter,
  };
};
