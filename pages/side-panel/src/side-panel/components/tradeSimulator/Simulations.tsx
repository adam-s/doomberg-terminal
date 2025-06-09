import {
  makeStyles,
  tokens, // Ensure tokens is imported
  Text,
  Badge,
  Tooltip,
  SearchBox,
  type SearchBoxChangeEvent,
  type InputOnChangeData,
} from '@fluentui/react-components';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { PopupFilter, TradeDirectionFilter } from './PopupFilter';
import {
  useSimulationSearch,
  UseSimulationSearchResult,
} from '@src/side-panel/hooks/simulation/useSimulationSearch';
import { IPerformanceReport } from '@src/services/simulators/tradeSimulator/strategy/baseStrategy';
import { Sparkline } from '../charts/Sparkline';
import {
  PanelId,
  useSimulationSummary,
  PositionStatus, // Import PositionStatus type
} from '@src/side-panel/hooks/simulation/useSimulationSummary';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    height: '100%',
    boxSizing: 'border-box',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minWidth: 0, // Enable flex items to shrink below their minimum content size
    gap: tokens.spacingHorizontalM,
  },
  strategyInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0, // Enable flex items to shrink
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
  },
  strategyId: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
  },
  profit: {
    color: tokens.colorPaletteGreenForeground1,
  },
  loss: {
    color: tokens.colorPaletteRedForeground1,
  },
  metrics: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  badge: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  position: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '200px',
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    minWidth: 'fit-content', // Prevent shrinking of the results section
    flexShrink: 0,
    flexGrow: 0,
    flexBasis: 'auto',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalS,
  },
  strategyText: {
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dynamicStrategy: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeft: `3px solid ${tokens.colorBrandBackground}`,
  },
  resultsRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalM,
  },
  dynamicStrategyContainer: {
    marginBottom: tokens.spacingVerticalL,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    padding: tokens.spacingVerticalS,
  },
  dynamicStrategyHeader: {
    color: tokens.colorBrandForeground1,
    marginBottom: tokens.spacingVerticalS,
  },
  regularStrategiesContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    // Custom dark scrollbar styles
    '&::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
      margin: '-10px',
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: tokens.colorNeutralBackground1,
      borderRadius: tokens.borderRadiusMedium,
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: tokens.colorNeutralBackground5,
      borderRadius: tokens.borderRadiusMedium,
      border: `1px solid ${tokens.colorNeutralBackground1}`,
    },
    '&::-webkit-scrollbar-thumb:hover': {
      backgroundColor: tokens.colorNeutralBackground6,
    },
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralBackground5} ${tokens.colorNeutralBackground1}`,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
  },
  summaryMetrics: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center',
  },
  searchAndFilterContainer: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: tokens.spacingVerticalM,
  },
  searchBox: {
    flexGrow: 1,
  },
  filterPopoverBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalM,
    minWidth: '250px',
  },
  rangeContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  rangeTrack: {
    height: '5px',
    width: '100%',
    borderRadius: '4px',
    alignSelf: 'center',
  },
  rangeThumb: {
    height: '18px',
    width: '18px',
    borderRadius: '50%',
    backgroundColor: tokens.colorNeutralForeground1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: tokens.shadow4,
    border: `2px solid ${tokens.colorNeutralBackground1}`,
  },
  rangeLabelContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalXS,
  },
  rangeValues: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

// Define colors based on tokens for consistency
const COLORS = {
  profit: tokens.colorPaletteGreenForeground1, // Use token for green
  loss: tokens.colorPaletteRedForeground1, // Use token for red
};

const Row = ({ index, style, data }: ListChildComponentProps<IPerformanceReport[]>) => {
  const styles = useStyles();
  const report = data[index];
  return (
    <div
      style={style}
      className={styles.row}
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={data.length}>
      <div className={styles.strategyInfo}>
        <Tooltip content={report.id} relationship="label" withArrow positioning="above">
          <Text className={styles.strategyId}>{report.id}</Text>
        </Tooltip>
        <div className={styles.metrics}>
          <Badge appearance="outline" className={styles.badge}>
            {report.trades} trades
          </Badge>
          <Badge appearance="outline" className={styles.badge}>
            {report.winRate.toFixed(1)}% win
          </Badge>
          <Badge appearance="outline" className={styles.badge}>
            {report.trades > 0 ? `$${report.averageTradeProfit.toFixed(2)} avg` : '$0.00 avg'}
          </Badge>
        </div>
        <Text className={styles.position}>
          {report.position
            ? `${report.position.isLong ? 'LONG' : 'SHORT'} @ $${report.position.price.toFixed(2)}`
            : 'No position'}
        </Text>
      </div>
      <div className={styles.results}>
        <div className={styles.resultsRow}>
          {report.lastTrade && (
            <Text>
              Last: {report.lastTrade.isWin ? '+' : '-'}$
              {Math.abs(report.lastTrade.profit).toFixed(2)}
            </Text>
          )}
          <Text className={report.pnl >= 0 ? styles.profit : styles.loss}>
            Total: {report.pnl >= 0 ? '+' : '-'}${Math.abs(report.pnl).toFixed(2)}
          </Text>
        </div>
      </div>
    </div>
  );
};

export const Simulators: React.FC<{ panelId: PanelId }> = ({ panelId }) => {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ height: number; width: number }>({
    height: 0,
    width: 0,
  });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [topRowsCount, setTopRowsCount] = useState<number>(3);

  // Use the custom hook to get simulation data and handlers, passing panelId
  const {
    filteredAndSortedReports,
    summary,
    filterBounds,
    filterValues,
    sortCriteria,
    sortDirection,
    tradeDirectionFilter,
    setFilterValues,
    handleResetFilters,
    handleSetSort,
    setFiltersManuallySet,
    setTradeDirectionFilter,
  }: UseSimulationSearchResult = useSimulationSearch(searchTerm, panelId);

  // Set default trade direction filter based on panelId
  useEffect(() => {
    if (panelId === PanelId.Left) {
      setTradeDirectionFilter(TradeDirectionFilter.LONG);
    } else if (panelId === PanelId.Right) {
      setTradeDirectionFilter(TradeDirectionFilter.SHORT);
    }
  }, [panelId, setTradeDirectionFilter]);

  const {
    summaries,
    pnlHistories,
    setSummary,
    addPnlHistoryEntry,
    clearPnlHistory,
    setActivePosition, // Get setActivePosition from the hook
  } = useSimulationSummary();

  const handleSearchChange = useCallback(
    (_event: SearchBoxChangeEvent, data: InputOnChangeData) => {
      setSearchTerm(data.value);
    },
    [],
  );

  // Use ResizeObserver to track container size changes
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new window.ResizeObserver(entries => {
      for (const entry of entries) {
        const { height, width } = entry.contentRect;
        setDimensions(dim => {
          if (dim.height !== height || dim.width !== width) {
            return { height, width };
          }
          return dim;
        });
      }
    });
    observer.observe(node);
    // Initial measure in case observer doesn't fire immediately
    setDimensions({ height: node.clientHeight, width: node.clientWidth });
    return () => {
      observer.disconnect();
    };
  }, []);

  // Effect to update the summary and PnL history
  useEffect(() => {
    if (summary) {
      setSummary(panelId, summary);
      addPnlHistoryEntry(panelId, summary.averagePnL);
    } else {
      // If there's no summary (e.g., no reports), clear the history
      clearPnlHistory(panelId);
    }
  }, [summary, panelId, setSummary, addPnlHistoryEntry, clearPnlHistory]);

  // Effect to update the active position status based on the top N reports
  useEffect(() => {
    let activePositionStatus: PositionStatus = 'none'; // Default to 'none'
    const topReports = filteredAndSortedReports.slice(0, topRowsCount); // Use the topRowsCount state
    const activeReport = topReports.find(report => report.position);
    if (activeReport && activeReport.position) {
      activePositionStatus = activeReport.position.isLong ? 'long' : 'short';
    }
    setActivePosition(panelId, activePositionStatus);
  }, [filteredAndSortedReports, panelId, setActivePosition, topRowsCount]); // Add topRowsCount to dependencies

  // Determine Sparkline color based on average P&L
  const currentSummary = summaries[panelId];
  const sparklineColor = (currentSummary?.averagePnL ?? 0) >= 0 ? COLORS.profit : COLORS.loss;

  // Estimate item size (px)
  const ITEM_SIZE = 95;

  return (
    <div className={styles.root}>
      <div className={styles.searchAndFilterContainer}>
        <SearchBox
          className={styles.searchBox}
          placeholder="Search strategies by ID..."
          value={searchTerm}
          onChange={handleSearchChange}
          aria-label="Search strategies"
        />
        <PopupFilter
          filterValues={filterValues}
          filterBounds={filterBounds}
          setFilterValues={setFilterValues}
          handleResetFilters={handleResetFilters}
          sortCriteria={sortCriteria}
          sortDirection={sortDirection}
          setSort={handleSetSort}
          setFiltersManuallySet={setFiltersManuallySet}
          summary={summary}
          tradeDirectionFilter={tradeDirectionFilter}
          setTradeDirectionFilter={setTradeDirectionFilter}
          topRowsCount={topRowsCount}
          setTopRowsCount={setTopRowsCount}
        />
      </div>
      {currentSummary && ( // Use currentSummary here for check
        <div className={styles.summaryRow}>
          <div className={styles.summaryMetrics} style={{ flex: 1 }}>
            <Badge appearance="outline" className={styles.badge}>
              {currentSummary.averageTrades} trades {/* Use currentSummary */}
            </Badge>
            <Text>Win Rate: {currentSummary.averageWinRate.toFixed(1)}%</Text>{' '}
            {/* Use currentSummary */}
            <Text className={currentSummary.averagePnL >= 0 ? styles.profit : styles.loss}>
              {' '}
              {/* Use currentSummary */}
              P&L: {currentSummary.averagePnL >= 0 ? '+' : '-'}$
              {Math.abs(currentSummary.averagePnL).toFixed(2)} {/* Use currentSummary */}
            </Text>
            <div
              style={{ flex: 1, minWidth: 0, height: 20, display: 'flex', alignItems: 'center' }}>
              {/* Pass the dynamic sparklineColor */}
              <Sparkline
                data={pnlHistories[panelId] || []}
                width={80}
                height={20}
                color={sparklineColor}
              />
            </div>
          </div>
        </div>
      )}
      <div className={styles.content} ref={containerRef}>
        {dimensions.height > 0 && dimensions.width > 0 && (
          <FixedSizeList
            height={dimensions.height}
            itemCount={filteredAndSortedReports.length}
            itemSize={ITEM_SIZE}
            width={dimensions.width}
            itemData={filteredAndSortedReports}
            className={styles.regularStrategiesContainer}>
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
};
