import React, { useMemo } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { useParentSize } from '@visx/responsive';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { useSentiment2 } from '@src/side-panel/hooks/useSentiment2';
import { SMADataPoint } from '@src/services/sentiment2/sentimentUtils';

// Color constants matching the Flow theme
const COLORS = {
  axis: { line: '#777', text: '#777' },
  series: {
    sentiment: {
      line: '#2899f5', // Line color for sentiment chart line (always blue)
      positive: '#107c10', // Green for positive value/arrow display
      negative: '#f25022', // Red for negative value/arrow display
    },
    sma: { line: '#2899f5' }, // SMA line color (matches sentiment line) - kept for potential future use
    composite: { line: '#ffb900', negative: '#f25022' }, // Composite remains potentially different
  },
  grid: { zeroLine: '#8A8886' },
  background: 'rgba(0, 0, 0, 0.3)',
};

// Define margins - reduced for more chart area
const margin = { top: 4, right: 4, bottom: 10, left: 40 };

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '10px', // Added 10px padding around all charts
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
  },
  chartsContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '12px', // Space between charts
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: '100px', // Reduced height for Sentiment chart
    paddingBottom: '8px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '12px', // Smaller font size to match VolatilitySkewChart
    color: COLORS.axis.text,
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: '1 1 auto',
    minHeight: 0, // Allow flexbox to shrink
  },
  emptyText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '12px', // Smaller font
    color: '#6b6b6b',
  },
  valueText: {
    fontSize: '11px', // Smaller font
    fontWeight: '600',
    color: '#777',
  },
  sentimentValue: {
    fontWeight: 'bold',
    fontSize: '12px', // Smaller font
  },
});

const useSentimentArrowStyles = makeStyles({
  arrow: {
    marginTop: '-1.5px',
    marginLeft: '8px', // Increased from 4px to 8px for more padding
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'Arial, sans-serif',
    lineHeight: 1,
    transition: 'color 0.3s ease',
    display: 'inline-block',
    verticalAlign: 'middle',
  },
});

// Component for displaying the current SMA value
interface CurrentValueProps {
  value: number;
  label: string;
  arrow?: string;
  valueColor?: string; // Renamed from arrowColor for clarity
}

const CurrentValue: React.FC<CurrentValueProps> = ({ value, label, arrow, valueColor }) => {
  const styles = useStyles();
  const arrowStyles = useSentimentArrowStyles();
  // Use the provided valueColor for both the text and the arrow
  const color = valueColor ?? COLORS.axis.text; // Default to axis text color if none provided

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className={styles.valueText}>{label}:</span>
      <span
        className={styles.sentimentValue}
        style={{ color, display: 'flex', alignItems: 'center', gap: '4px' }}>
        {value.toFixed(4)}
        {arrow && (
          <span className={arrowStyles.arrow} style={{ color }}>
            {' '}
            {/* Use the same color */}
            {arrow}
          </span>
        )}
      </span>
    </div>
  );
};

// Format date for display
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

// Separate SentimentChart component to follow same pattern as PricebookChart
interface SentimentChartProps {
  // data: SentimentDataPoint[]; // Prop seems unused, can be removed if not needed
  smaData: SMADataPoint[];
  // smaValue: number; // Prop seems unused, can be removed if not needed
}

const SentimentChart: React.FC<SentimentChartProps> = ({ smaData }) => {
  const { parentRef, width, height } = useParentSize();

  // Always attach parentRef to the outer div, regardless of render state
  const innerWidth = (width || 0) - margin.left - margin.right;
  const innerHeight = (height || 0) - margin.top - margin.bottom;

  // Only use the last 30 valid SMA data points (value !== null)
  const validSmaData = smaData.filter(
    (d): d is { timestamp: number; value: number } => d.value !== null,
  );
  const limitedSmaData = validSmaData.slice(-30);

  // Get min and max timestamps from limited SMA data
  const timestamps = limitedSmaData.map(d => d.timestamp);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);

  // Get min and max values from limited SMA data
  const values = limitedSmaData.map(d => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(0.001, maxValue - minValue);
  const padding = valueRange * 0.1;

  // Ensure the domain includes 0
  const domainMin = Math.min(0, minValue - padding);
  const domainMax = Math.max(0, maxValue + padding);

  // Create scales
  const xScale = scaleTime({
    domain: [new Date(minTime), new Date(maxTime)],
    range: [0, innerWidth],
  });
  const yScale = scaleLinear({
    domain: [domainMin, domainMax], // Use updated domain
    range: [innerHeight, 0],
    nice: true,
  });

  // Check if we have valid scales before rendering
  const yDomain = yScale.domain();
  const xDomain = xScale.domain();
  const hasValidScales =
    yDomain[0] !== yDomain[1] &&
    xDomain[0] instanceof Date &&
    xDomain[1] instanceof Date &&
    xDomain[0].getTime() !== xDomain[1].getTime();

  // Calculate the y-position of the zero line
  const zeroY = yScale(0);
  const showZeroLine = zeroY >= 0 && zeroY <= innerHeight; // Check if 0 is within the chart height

  // Calculate and draw a straight trend line from the 12th-to-last to the last value
  let trendLine = null;
  if (limitedSmaData.length >= 12) {
    const startIdx = limitedSmaData.length - 12;
    const endIdx = limitedSmaData.length - 1;
    const start = limitedSmaData[startIdx];
    const end = limitedSmaData[endIdx];
    const startX = xScale(new Date(start.timestamp));
    const startY = yScale(start.value);
    const endX = xScale(new Date(end.timestamp));
    const endY = yScale(end.value);
    const isUpward = end.value > start.value;
    const isDownward = end.value < start.value;
    // Invert the colors: Upward is negative (red), Downward is positive (green)
    const trendColor = isUpward
      ? COLORS.series.sentiment.negative // Use negative color for upward trend
      : isDownward
        ? COLORS.series.sentiment.positive // Use positive color for downward trend
        : COLORS.axis.line;
    trendLine = { startX, startY, endX, endY, trendColor };
  }

  return (
    <div ref={parentRef} style={{ width: '100%', height: '100%' }}>
      {!width || !height || smaData.length === 0 ? null : hasValidScales ? (
        <svg style={{ width: '100%', height: '100%' }}>
          <Group left={margin.left} top={margin.top}>
            {/* Y-axis with 2 ticks */}
            <AxisLeft
              scale={yScale}
              numTicks={2}
              stroke={COLORS.axis.line}
              tickStroke={COLORS.axis.line}
              tickLabelProps={() => ({
                fill: COLORS.axis.text,
                fontSize: 10,
                textAnchor: 'end',
                dy: '0.33em',
              })}
            />
            {/* Horizontal dashed grid lines at each tick (excluding zero if it coincides) */}
            {yScale
              .ticks(2)
              .filter(tick => tick !== 0) // Don't draw a regular grid line if it's 0
              .map(tick => (
                <Line
                  key={`grid-line-${tick}`}
                  from={{ x: 0, y: yScale(tick) }}
                  to={{ x: innerWidth, y: yScale(tick) }}
                  stroke={COLORS.axis.line}
                  strokeDasharray="4,4"
                  strokeWidth={0.5}
                  pointerEvents="none"
                />
              ))}
            {/* Explicit dashed line at Y=0 */}
            {showZeroLine && (
              <Line
                key="zero-line"
                from={{ x: 0, y: zeroY }}
                to={{ x: innerWidth, y: zeroY }}
                stroke={COLORS.grid.zeroLine} // Use specific zero line color
                strokeDasharray="4,4" // Keep it dashed
                strokeWidth={0.7} // Slightly thicker for emphasis
                pointerEvents="none"
              />
            )}
            {/* SMA Line (single blue color) */}
            {limitedSmaData.length > 1 && (
              <LinePath
                data={limitedSmaData}
                x={d => xScale(new Date(d.timestamp))}
                y={d => yScale(d.value)}
                stroke={COLORS.series.sentiment.line}
                strokeWidth={1}
                curve={curveMonotoneX}
              />
            )}
            {/* Trend Line (12th-to-last to last) */}
            {trendLine && (
              <Line
                from={{ x: trendLine.startX, y: trendLine.startY }}
                to={{ x: trendLine.endX, y: trendLine.endY }}
                stroke={trendLine.trendColor}
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </Group>
        </svg>
      ) : (
        <div style={{ width: '100%', height: '100%' }}>Invalid data range</div>
      )}
    </div>
  );
};

// Individual chart wrapper component for each expiration
interface ExpirationChartProps {
  symbol: string;
  expirationDate: string;
  sentimentData: {
    smaHistory: SMADataPoint[];
    sma10: number;
  };
}

const ExpirationChart: React.FC<ExpirationChartProps> = ({
  symbol,
  expirationDate,
  sentimentData,
}) => {
  const styles = useStyles();
  const { smaHistory, sma10 } = sentimentData;
  const isLoading = !smaHistory || smaHistory.length === 0;
  const formattedDate = formatDate(expirationDate);

  // Compute arrow and color for SMA direction
  const validSma = smaHistory.filter(
    (d): d is { value: number; timestamp: number } =>
      d.value !== null && typeof d.value === 'number',
  );
  const lastValue = validSma.length > 0 ? validSma[validSma.length - 1].value : 0;
  const prevValue = validSma.length > 1 ? validSma[validSma.length - 2].value : lastValue;
  const diff = lastValue - prevValue;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '→';
  // Invert the color logic: Positive diff (up) is red, negative diff (down) is green
  const valueColor =
    diff > 0
      ? COLORS.series.sentiment.negative // Red for up
      : diff < 0
        ? COLORS.series.sentiment.positive // Green for down
        : COLORS.axis.text; // Grey for no change

  return (
    <div className={styles.chartSection}>
      <div className={styles.chartHeader}>
        <div>{`${symbol} (${formattedDate})`}</div>
        {/* Pass sma10 and the calculated valueColor */}
        <CurrentValue value={sma10} label="SMA" arrow={arrow} valueColor={valueColor} />
      </div>
      <div className={styles.chartContainer}>
        {!isLoading ? (
          <div style={{ height: '100%', width: '100%' }}>
            <SentimentChart
              smaData={smaHistory}
              // data={[]} // Pass empty array or remove prop if unused
              // smaValue={0} // Pass default or remove prop if unused
            />
          </div>
        ) : (
          <div className={styles.emptyText}>Loading sentiment data...</div>
        )}
      </div>
    </div>
  );
};

export const Sentiment: React.FC = () => {
  const styles = useStyles();
  const { sentimentBySymbolAndExpiration } = useSentiment2();
  const displaySymbol = 'QQQ';
  const expirationDates = useMemo(
    () => sentimentBySymbolAndExpiration[displaySymbol]?.expirationDates ?? [],
    [sentimentBySymbolAndExpiration, displaySymbol], // Added displaySymbol dependency
  );
  const firstExpiration = expirationDates[0] ?? '';
  const secondExpiration = expirationDates[1] ?? '';

  // Memoize data fetching for first expiration
  const firstExpirationData = useMemo(() => {
    const data = sentimentBySymbolAndExpiration[displaySymbol]?.data.get(firstExpiration);
    return {
      smaHistory: data?.smaHistory ?? [],
      sma10: data?.sma10 ?? 0,
    };
  }, [sentimentBySymbolAndExpiration, displaySymbol, firstExpiration]);

  // Memoize data fetching for second expiration
  const secondExpirationData = useMemo(() => {
    const data = sentimentBySymbolAndExpiration[displaySymbol]?.data.get(secondExpiration);
    return {
      smaHistory: data?.smaHistory ?? [],
      sma10: data?.sma10 ?? 0,
    };
  }, [sentimentBySymbolAndExpiration, displaySymbol, secondExpiration]);

  const hasFirstExpirationData = firstExpiration && firstExpirationData.smaHistory.length > 0;
  const hasSecondExpirationData = secondExpiration && secondExpirationData.smaHistory.length > 0;

  return (
    <div className={styles.root}>
      <div className={styles.chartsContainer}>
        {/* Render first expiration chart or loading state */}
        {firstExpiration ? (
          hasFirstExpirationData ? (
            <ExpirationChart
              symbol={displaySymbol}
              expirationDate={firstExpiration}
              sentimentData={firstExpirationData}
            />
          ) : (
            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <div>{`${displaySymbol} (${formatDate(firstExpiration)})`}</div>
              </div>
              <div className={styles.chartContainer}>
                <div className={styles.emptyText}>Loading sentiment data...</div>
              </div>
            </div>
          )
        ) : null}

        {/* Render second expiration chart or loading state */}
        {secondExpiration ? (
          hasSecondExpirationData ? (
            <ExpirationChart
              symbol={displaySymbol}
              expirationDate={secondExpiration}
              sentimentData={secondExpirationData}
            />
          ) : (
            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <div>{`${displaySymbol} (${formatDate(secondExpiration)})`}</div>
              </div>
              <div className={styles.chartContainer}>
                <div className={styles.emptyText}>Loading sentiment data...</div>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};
