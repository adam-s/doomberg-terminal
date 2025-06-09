/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Label,
  Text,
  makeStyles,
  tokens,
  Slider,
  type SliderOnChangeData,
  ToggleButton,
  Divider,
  Badge,
} from '@fluentui/react-components';
import {
  Filter24Regular,
  ArrowSortUp16Regular,
  ArrowSortDown16Regular,
} from '@fluentui/react-icons';

export enum SortCriteria {
  Trades = 'trades',
  WinRate = 'winRate',
  AvgPL = 'avgPL',
  TotalPL = 'totalPL',
  Rank = 'Rank', // Add Rank option
  Default = 'default', // Represents the initial ranked order
}

export enum SortDirection {
  Ascending = 'asc',
  Descending = 'desc',
}

export enum TradeDirectionFilter {
  LONG = 'long',
  SHORT = 'short',
  BOTH = 'both',
}

export interface FilterBounds {
  trades: { min: number; max: number };
  winRate: { min: number; max: number };
  avgPL: { min: number; max: number };
}

export interface FilterValues {
  trades: [number, number];
  winRate: [number, number];
  avgPL: [number, number];
}

interface PopupFilterProps {
  filterValues: FilterValues;
  filterBounds: FilterBounds;
  setFilterValues: (values: FilterValues) => void;
  handleResetFilters: () => void;
  sortCriteria: SortCriteria;
  sortDirection: SortDirection;
  setSort: (criteria: SortCriteria) => void;
  setFiltersManuallySet: (manuallySet: boolean) => void;
  summary?: {
    averageTrades: number;
    averageWinRate: number;
    averagePnL: number;
  } | null;
  tradeDirectionFilter: TradeDirectionFilter;
  setTradeDirectionFilter: (direction: TradeDirectionFilter) => void;
  topRowsCount: number;
  setTopRowsCount: (count: number) => void;
}

const useStyles = makeStyles({
  popoverSurface: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    maxWidth: '336px',
    boxSizing: 'border-box',
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: '16px',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    overflowY: 'auto',
  },
  dialogActions: {
    marginTop: tokens.spacingVerticalXS,
  },
  surfaceTransparentBackdrop: {
    backdropFilter: 'blur(8px)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  filterContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  filterLabelContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalXXS,
  },
  filterValues: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  fractionButton: {
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    padding: `0 ${tokens.spacingHorizontalXXS}`,
    ':hover': {
      color: tokens.colorBrandForeground1,
    },
  },
  activeFractionButton: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  sliderGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  sortContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sortLabel: {
    fontWeight: tokens.fontWeightSemibold,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  sortButtonGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  sortButton: {
    flexGrow: 1,
    flexBasis: 'auto',
    minWidth: '80px',
    height: '28px',
    fontSize: tokens.fontSizeBase200,
  },
  sliderTrack: {
    ':global(.fui-Slider__rail)': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  resetButtonContainer: {
    paddingTop: tokens.spacingVerticalS,
  },
  surface: {
    boxSizing: 'border-box',
  },
  actionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalXS,
  },
});

const formatNumber = (num: number, decimals = 0): string => {
  if (!Number.isFinite(num)) {
    return (0).toFixed(decimals);
  }
  if (Math.abs(num) < 0.005 && decimals > 0) {
    return (0).toFixed(decimals);
  }
  return num.toFixed(decimals);
};

export const PopupFilter: React.FC<PopupFilterProps> = ({
  filterValues,
  filterBounds,
  setFilterValues,
  handleResetFilters,
  sortCriteria,
  sortDirection,
  setSort,
  setFiltersManuallySet,
  summary,
  tradeDirectionFilter,
  setTradeDirectionFilter,
  topRowsCount,
  setTopRowsCount,
}) => {
  const styles = useStyles();
  const [isOpen, setIsOpen] = useState(false);
  // State to track the active fraction for the trades filter
  const [activeTradeFraction, setActiveTradeFraction] = useState<'1/3' | '1/2' | null>(null);

  // Add this effect to the component to update filter values when filterBounds changes
  useEffect(() => {
    // If a fraction button is active, we should recalculate when filterBounds changes
    if (activeTradeFraction) {
      const { max: absoluteMax } = filterBounds.trades;
      const safeAbsoluteMax = Number.isFinite(absoluteMax) ? absoluteMax : 1;

      let newMinTrades = 0;
      if (activeTradeFraction === '1/3') {
        newMinTrades = Math.ceil(safeAbsoluteMax * (1 / 3));
      } else if (activeTradeFraction === '1/2') {
        newMinTrades = Math.ceil(safeAbsoluteMax * (1 / 2));
      }

      // Ensure newMinTrades doesn't exceed safeAbsoluteMax
      newMinTrades = Math.min(newMinTrades, safeAbsoluteMax);

      // Only update if the new value is different
      if (filterValues.trades[0] !== newMinTrades) {
        setFilterValues({
          ...filterValues,
          trades: [newMinTrades, safeAbsoluteMax],
        });
      }
    }
  }, [filterBounds, activeTradeFraction, filterValues, setFilterValues]);

  // Helper to render a filter section with one or two sliders
  const renderFilterSlider = (
    type: keyof FilterValues,
    label: string,
    step: number,
    valueFormatFn: (value: number) => string,
  ) => {
    const { min: absoluteMin, max: absoluteMax } = filterBounds[type];
    const [currentStart, currentEnd] = filterValues[type];
    const safeAbsoluteMax = Number.isFinite(absoluteMax) ? absoluteMax : step;
    const safeAbsoluteMin = Number.isFinite(absoluteMin) ? absoluteMin : 0;
    const safeCurrentStart = Math.max(safeAbsoluteMin, Math.min(safeAbsoluteMax, currentStart));
    const safeCurrentEnd = Math.max(safeAbsoluteMin, Math.min(safeAbsoluteMax, currentEnd));

    const handleMinChange = (_ev: unknown, data: SliderOnChangeData) => {
      setFiltersManuallySet(true);
      // Reset fraction selection if slider is moved manually
      setActiveTradeFraction(null);
      setFilterValues({
        ...filterValues,
        [type]: [data.value, safeAbsoluteMax],
      });
    };

    // Handler for fraction button clicks
    const handleFractionClick = (fraction: '1/3' | '1/2') => {
      // Ensure safeAbsoluteMax is calculated correctly based on potentially updated filterBounds
      const { max: absoluteMax } = filterBounds.trades;
      const step = 1; // Step for trades is 1
      const safeAbsoluteMax = Number.isFinite(absoluteMax) ? absoluteMax : step;

      let newMinTrades = 0;
      if (fraction === '1/3') {
        newMinTrades = Math.ceil(safeAbsoluteMax * (1 / 3));
      } else if (fraction === '1/2') {
        newMinTrades = Math.ceil(safeAbsoluteMax * (1 / 2));
      }

      // Ensure newMinTrades does not exceed safeAbsoluteMax, especially if safeAbsoluteMax is small
      newMinTrades = Math.min(newMinTrades, safeAbsoluteMax);

      setFiltersManuallySet(true);
      setActiveTradeFraction(fraction);
      setFilterValues({
        ...filterValues,
        trades: [newMinTrades, safeAbsoluteMax],
      });
    };

    if (type === 'trades') {
      return (
        <div className={styles.filterContainer}>
          <div className={styles.filterLabelContainer}>
            <Label htmlFor={`${type}-min-slider`}>Trades</Label>
            <div>
              <span
                role="button"
                tabIndex={0}
                onClick={() => handleFractionClick('1/3')}
                onKeyDown={e => e.key === 'Enter' && handleFractionClick('1/3')}
                className={`${styles.fractionButton} ${
                  activeTradeFraction === '1/3' ? styles.activeFractionButton : ''
                }`}>
                [1/3]
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => handleFractionClick('1/2')}
                onKeyDown={e => e.key === 'Enter' && handleFractionClick('1/2')}
                className={`${styles.fractionButton} ${
                  activeTradeFraction === '1/2' ? styles.activeFractionButton : ''
                }`}>
                [1/2]
              </span>
            </div>
            <Text className={styles.filterValues}>
              {valueFormatFn(safeCurrentStart)} - {valueFormatFn(safeAbsoluteMax)}
            </Text>
          </div>
          <div className={styles.sliderGroup}>
            <Slider
              id={`${type}-min-slider`}
              aria-label="Minimum Trades"
              min={0}
              max={safeAbsoluteMax}
              step={step}
              value={safeCurrentStart}
              onChange={handleMinChange}
              className={styles.sliderTrack}
            />
          </div>
        </div>
      );
    }

    // For avgPL and winRate, use the min and max from filterBounds
    return (
      <div className={styles.filterContainer}>
        <div className={styles.filterLabelContainer}>
          <Label htmlFor={`${type}-min-slider`}>{label}</Label>
          <Text className={styles.filterValues}>
            {`${valueFormatFn(safeCurrentStart)} - ${valueFormatFn(safeCurrentEnd)}`}
          </Text>
        </div>
        <div className={styles.sliderGroup}>
          <Slider
            id={`${type}-min-slider`}
            aria-label={`${label} Minimum`}
            min={safeAbsoluteMin}
            max={safeCurrentEnd}
            step={step}
            value={safeCurrentStart}
            onChange={(_ev, data) => {
              setFiltersManuallySet(true);
              setFilterValues({
                ...filterValues,
                [type]: [data.value, safeCurrentEnd],
              });
            }}
            className={styles.sliderTrack}
          />
        </div>
      </div>
    );
  };

  return (
    <Popover
      positioning="below-end"
      open={isOpen}
      onOpenChange={(_e, data) => setIsOpen(data.open)}
      withArrow
      trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Button icon={<Filter24Regular />} aria-label="Filter and Sort Options" />
      </PopoverTrigger>
      <PopoverSurface className={styles.popoverSurface} aria-describedby={undefined}>
        {summary && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              marginBottom: 8,
              flexWrap: 'wrap',
            }}>
            <Badge appearance="outline" size="small">
              {summary.averageTrades} avg trades
            </Badge>
            <Text size={200}>Win: {summary.averageWinRate.toFixed(1)}%</Text>
            <Text
              size={200}
              style={{
                color:
                  summary.averagePnL >= 0
                    ? tokens.colorPaletteGreenForeground1
                    : tokens.colorPaletteRedForeground1,
              }}>
              P&L: {summary.averagePnL >= 0 ? '+' : '-'}${Math.abs(summary.averagePnL).toFixed(2)}
            </Text>
          </div>
        )}
        <div className={styles.sortContainer}>
          <Label className={styles.sortLabel}>Sort By</Label>
          <div className={styles.sortButtonGroup}>
            <ToggleButton
              className={styles.sortButton}
              checked={sortCriteria === SortCriteria.Trades}
              onClick={() => setSort(SortCriteria.Trades)}
              icon={
                sortCriteria === SortCriteria.Trades ? (
                  sortDirection === SortDirection.Descending ? (
                    <ArrowSortDown16Regular />
                  ) : (
                    <ArrowSortUp16Regular />
                  )
                ) : undefined
              }>
              Trades
            </ToggleButton>
            <ToggleButton
              className={styles.sortButton}
              checked={sortCriteria === SortCriteria.WinRate}
              onClick={() => setSort(SortCriteria.WinRate)}
              icon={
                sortCriteria === SortCriteria.WinRate ? (
                  sortDirection === SortDirection.Descending ? (
                    <ArrowSortDown16Regular />
                  ) : (
                    <ArrowSortUp16Regular />
                  )
                ) : undefined
              }>
              Win Rate
            </ToggleButton>
            <ToggleButton
              className={styles.sortButton}
              checked={sortCriteria === SortCriteria.AvgPL}
              onClick={() => setSort(SortCriteria.AvgPL)}
              icon={
                sortCriteria === SortCriteria.AvgPL ? (
                  sortDirection === SortDirection.Descending ? (
                    <ArrowSortDown16Regular />
                  ) : (
                    <ArrowSortUp16Regular />
                  )
                ) : undefined
              }>
              Avg P/L
            </ToggleButton>
            <ToggleButton
              className={styles.sortButton}
              checked={sortCriteria === SortCriteria.TotalPL}
              onClick={() => setSort(SortCriteria.TotalPL)}
              icon={
                sortCriteria === SortCriteria.TotalPL ? (
                  sortDirection === SortDirection.Descending ? (
                    <ArrowSortDown16Regular />
                  ) : (
                    <ArrowSortUp16Regular />
                  )
                ) : undefined
              }>
              Profit/Loss
            </ToggleButton>
          </div>
        </div>
        <Divider />
        {/* Trade Direction Filter Section */}
        <div className={styles.sortContainer}>
          <Label className={styles.sortLabel}>Trade Direction</Label>
          <div className={styles.sortButtonGroup}>
            <ToggleButton
              className={styles.sortButton}
              checked={tradeDirectionFilter === TradeDirectionFilter.LONG}
              onClick={() =>
                setTradeDirectionFilter(
                  tradeDirectionFilter === TradeDirectionFilter.LONG
                    ? TradeDirectionFilter.BOTH
                    : TradeDirectionFilter.LONG,
                )
              }>
              Long
            </ToggleButton>
            <ToggleButton
              className={styles.sortButton}
              checked={tradeDirectionFilter === TradeDirectionFilter.SHORT}
              onClick={() =>
                setTradeDirectionFilter(
                  tradeDirectionFilter === TradeDirectionFilter.SHORT
                    ? TradeDirectionFilter.BOTH
                    : TradeDirectionFilter.SHORT,
                )
              }>
              Short
            </ToggleButton>
          </div>
        </div>
        <Divider />

        {/* Top Rows Slider */}
        <div className={styles.filterContainer}>
          <div className={styles.filterLabelContainer}>
            <Label htmlFor="top-rows-slider">Top Rows for Position</Label>
            <Text className={styles.filterValues}>{topRowsCount}</Text>
          </div>
          <Slider
            id="top-rows-slider"
            aria-label="Number of top rows to consider for active position"
            min={0}
            max={10}
            step={1}
            value={topRowsCount}
            onChange={(_ev, data) => setTopRowsCount(data.value)}
            className={styles.sliderTrack}
          />
        </div>
        <Divider />
        {/* End Top Rows Slider */}

        {renderFilterSlider('trades', 'Trades', 1, value => formatNumber(value))}
        {renderFilterSlider('winRate', 'Win Rate (%)', 3, value => `${formatNumber(value, 0)}%`)}
        {renderFilterSlider(
          'avgPL',
          'Average P/L ($)',
          0.01,
          value => `$${formatNumber(value, 2)}`,
        )}
        <div className={styles.actionsContainer}>
          <Button
            appearance="secondary"
            onClick={() => {
              handleResetFilters();
              setTopRowsCount(3); // Reset top rows count to default (5)
              setActiveTradeFraction(null); // Reset active fraction on main reset
            }}
            style={{ width: '100%' }}>
            Reset Filters & Sort
          </Button>
          <Button appearance="primary" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
      </PopoverSurface>
    </Popover>
  );
};
