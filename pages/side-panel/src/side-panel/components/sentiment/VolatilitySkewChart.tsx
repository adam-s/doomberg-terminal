import React, { useMemo } from 'react';
import { useSentiment2 } from '../../hooks/useSentiment2';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { useParentSize } from '@visx/responsive';
import { curveMonotoneX } from '@visx/curve';

const COLORS = {
  axis: { line: '#777', text: '#777' },
  series: {
    call: '#8bd100', // Green for calls
    put: '#f25022', // Red for puts
  },
  grid: { zeroLine: '#8A8886', atm: '#8A8886' },
  tooltip: {
    background: 'rgba(0, 0, 0, 0.7)',
    border: '#3b3a39',
    text: '#ffffff',
  },
  background: 'rgba(0, 0, 0, 0.3)',
};

const margin = { top: 4, right: 4, bottom: 40, left: 40 };

const SYMBOL_OPTIONS = ['SPY', 'QQQ'];

// --- Interfaces ---

interface SkewDataPoint {
  strike: number;
  callIV: number;
  putIV: number;
  smaCallIV: number;
  smaPutIV: number;
  callDelta: number;
  putDelta: number;
}

interface PlotPoint {
  delta: number;
  iv: number;
}

interface PlotData {
  callData: PlotPoint[];
  putData: PlotPoint[];
}

interface ComparisonCircleData {
  delta: number;
  color: string;
  radius: number;
}

// Assuming structure from useSentiment2 hook
interface VolatilitySkewRawPoint {
  strike: number;
  callIV: number;
  putIV: number;
  smaCallIV: number;
  smaPutIV: number;
  callDelta: number;
  putDelta: number;
}

interface ExpirationData {
  volatilitySkew: VolatilitySkewRawPoint[];
  // Add other properties if they exist
}

interface SymbolSentimentData {
  expirationDates: string[];
  data: Map<string, ExpirationData>;
}

interface SentimentHookData {
  [symbol: string]: SymbolSentimentData | undefined;
}

// --- Pure Helper Functions ---

/**
 * Formats a date string into 'MMM D' format.
 */
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString; // Fallback
  }
};

/**
 * Performs linear interpolation to find yTarget for a given xTarget.
 */
const interpolateY = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  xTarget: number,
): number | null => {
  if (x1 === x2) return y1; // Avoid division by zero
  if ((xTarget < x1 && xTarget < x2) || (xTarget > x1 && xTarget > x2)) {
    return null; // Target x is outside the interpolation range
  }
  return y1 + ((y2 - y1) * (xTarget - x1)) / (x2 - x1);
};

/**
 * Processes raw chart data: filters out outliers (IV < 10 for any IV field), sorts by strike, then by call delta.
 */
const processChartData = (chartData: SkewDataPoint[]): SkewDataPoint[] => {
  const filtered = chartData.filter(
    point =>
      point.callIV >= 10 && point.putIV >= 10 && point.smaCallIV >= 10 && point.smaPutIV >= 10,
  );
  const sortedByStrike = [...filtered].sort((a, b) => a.strike - b.strike);
  return sortedByStrike.sort((a, b) => a.callDelta - b.callDelta);
};

/**
 * Calculates plot data (call and put lines) from processed chart data.
 * Sorts data points by delta for line rendering and interpolation.
 */
const calculatePlotData = (processedChartData: SkewDataPoint[]): PlotData => {
  const sortedByCallDelta = [...processedChartData]
    .sort((a, b) => a.callDelta - b.callDelta)
    .map(point => ({
      delta: point.callDelta,
      iv: point.smaCallIV,
    }));

  const sortedByPutPlotDelta = [...processedChartData]
    .sort((a, b) => 1 + a.putDelta - (1 + b.putDelta)) // Sort by the value used for x-axis
    .map(point => ({
      delta: 1 + point.putDelta, // Map put delta (-1 to 0) to the range (0 to 1)
      iv: point.smaPutIV,
    }));

  return { callData: sortedByCallDelta, putData: sortedByPutPlotDelta };
};

/**
 * Calculates comparison circles based on IV difference between call and interpolated put lines.
 */
const calculateComparisonCircles = (
  plotData: PlotData,
  colors: typeof COLORS,
): ComparisonCircleData[] => {
  const { callData: callLineData, putData: putLineData } = plotData;

  const RADIUS_THRESHOLD_1 = 1.0;
  const RADIUS_THRESHOLD_2 = 2.0;
  const RADIUS_THRESHOLD_3 = 3.0;
  const RADIUS_THRESHOLD_4 = 4.0;

  if (putLineData.length < 2) {
    return callLineData.map(callPoint => ({
      delta: callPoint.delta,
      color: colors.series.call,
      radius: 2,
    }));
  }

  return callLineData.map(callPoint => {
    const currentCallDelta = callPoint.delta;
    const currentCallIV = callPoint.iv;

    let putLower: PlotPoint | null = null;
    let putUpper: PlotPoint | null = null;

    for (let i = 0; i < putLineData.length; i++) {
      if (putLineData[i].delta <= currentCallDelta) {
        putLower = putLineData[i];
      }
      if (putLineData[i].delta >= currentCallDelta && !putUpper) {
        putUpper = putLineData[i];
      }
    }

    let interpolatedPutIV: number | null = null;
    if (putLower && putUpper) {
      interpolatedPutIV = interpolateY(
        putLower.delta,
        putLower.iv,
        putUpper.delta,
        putUpper.iv,
        currentCallDelta,
      );
    } else if (putLower && putLower?.delta === currentCallDelta) {
      interpolatedPutIV = putLower.iv;
    } else if (putUpper?.delta === currentCallDelta) {
      interpolatedPutIV = putUpper.iv;
    }

    let color: string;
    let radius: number;
    if (interpolatedPutIV !== null) {
      const difference = Math.abs(interpolatedPutIV - currentCallIV);
      color = interpolatedPutIV > currentCallIV ? colors.series.put : colors.series.call;
      if (difference < RADIUS_THRESHOLD_1) {
        radius = 2;
      } else if (difference < RADIUS_THRESHOLD_2) {
        radius = 3;
      } else if (difference < RADIUS_THRESHOLD_3) {
        radius = 4;
      } else if (difference < RADIUS_THRESHOLD_4) {
        radius = 5;
      } else {
        radius = 6;
      }
    } else {
      color = colors.series.call;
      radius = 2;
    }

    return {
      delta: currentCallDelta,
      color: color,
      radius,
    };
  });
};

/**
 * Calculates the X-axis extents (min/max delta) for the chart.
 */
const calculateXExtents = (plotData: PlotData): [number, number] => {
  const allDeltas = [...plotData.callData.map(d => d.delta), ...plotData.putData.map(d => d.delta)];
  if (allDeltas.length === 0) return [0, 1];
  const minDelta = Math.min(0, ...allDeltas);
  const maxDelta = Math.max(1, ...allDeltas);
  return [minDelta, maxDelta];
};

/**
 * Calculates the Y-axis domain (min/max IV with padding) for the chart.
 */
const calculateYScaleDomain = (plotData: PlotData): [number, number] => {
  const allIVs = [...plotData.callData.map(d => d.iv), ...plotData.putData.map(d => d.iv)];
  if (allIVs.length === 0) {
    return [0, 100]; // Default domain if no data
  }
  const minIV = Math.min(...allIVs);
  const maxIV = Math.max(...allIVs);
  const range = maxIV - minIV || 1;
  const padding = range * 0.1;
  const topPaddingFactor = 0.15;
  return [Math.max(0, minIV - padding), maxIV + range * topPaddingFactor];
};

/**
 * Calculates the At-The-Money (ATM) Implied Volatility at 50 Delta (0.5).
 * Interpolates from both call and put lines and averages if possible.
 */
const calculateAtmIV = (plotData: PlotData): number | null => {
  const targetDelta = 0.5;
  let callIVAt50: number | null = null;
  let putIVAt50: number | null = null;

  // Interpolate Call IV
  const { callData, putData } = plotData;
  if (callData.length >= 2) {
    let callLower: PlotPoint | null = null;
    let callUpper: PlotPoint | null = null;
    for (let i = 0; i < callData.length; i++) {
      if (callData[i].delta <= targetDelta) callLower = callData[i];
      if (callData[i].delta >= targetDelta && !callUpper) callUpper = callData[i];
      if (callLower && callUpper) break;
    }
    if (callLower && callUpper) {
      callIVAt50 = interpolateY(
        callLower.delta,
        callLower.iv,
        callUpper.delta,
        callUpper.iv,
        targetDelta,
      );
    } else if (callLower?.delta === targetDelta) {
      callIVAt50 = callLower.iv;
    } else if (callUpper?.delta === targetDelta) {
      callIVAt50 = callUpper.iv;
    }
  }

  // Interpolate Put IV
  if (putData.length >= 2) {
    let putLower: PlotPoint | null = null;
    let putUpper: PlotPoint | null = null;
    for (let i = 0; i < putData.length; i++) {
      if (putData[i].delta <= targetDelta) putLower = putData[i];
      if (putData[i].delta >= targetDelta && !putUpper) putUpper = putData[i];
      if (putLower && putUpper) break;
    }
    if (putLower && putUpper) {
      putIVAt50 = interpolateY(
        putLower.delta,
        putLower.iv,
        putUpper.delta,
        putUpper.iv,
        targetDelta,
      );
    } else if (putLower?.delta === targetDelta) {
      putIVAt50 = putLower.iv;
    } else if (putUpper?.delta === targetDelta) {
      putIVAt50 = putUpper.iv;
    }
  }

  // Average or return available value
  if (callIVAt50 !== null && putIVAt50 !== null) {
    return (callIVAt50 + putIVAt50) / 2;
  }
  return callIVAt50 ?? putIVAt50 ?? null;
};

/**
 * Extracts and transforms volatility skew data for a specific expiration date.
 */
const extractExpirationData = (
  sentimentData: SentimentHookData | undefined,
  symbol: string,
  expirationDate: string,
): SkewDataPoint[] => {
  const symbolData = sentimentData?.[symbol];
  if (!symbolData || !expirationDate) return [];

  const expirationDetails = symbolData.data.get(expirationDate);
  if (!expirationDetails?.volatilitySkew) return [];

  return expirationDetails.volatilitySkew.map(point => ({
    strike: point.strike,
    callIV: point.callIV * 100, // Scale for display/plotting
    putIV: point.putIV * 100, // Scale for display/plotting
    smaCallIV: point.smaCallIV * 100, // Scale for plotting
    smaPutIV: point.smaPutIV * 100, // Scale for plotting
    callDelta: point.callDelta,
    putDelta: point.putDelta,
  }));
};

// --- Styles ---

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '10px',
    boxSizing: 'border-box',
  },
  chartsContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '12px',
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: '230px',
    paddingBottom: '8px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '12px',
    color: COLORS.axis.text,
    paddingLeft: '0px',
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: '1 1 auto',
    minHeight: 0,
  },
  noData: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
});

// --- Components ---

interface SingleVolatilitySkewChartProps {
  chartData: SkewDataPoint[];
  // expirationDate is passed but not used directly in rendering logic now
  // expirationDate: string;
}

const SingleVolatilitySkewChart: React.FC<SingleVolatilitySkewChartProps> = ({ chartData }) => {
  const { parentRef, width, height } = useParentSize();
  const styles = useStyles();

  // Use pure functions within useMemo for memoization based on inputs
  const processedChartData = useMemo(() => processChartData(chartData), [chartData]);
  const plotData = useMemo(() => calculatePlotData(processedChartData), [processedChartData]);
  const comparisonCircles = useMemo(() => calculateComparisonCircles(plotData, COLORS), [plotData]);
  const xExtents = useMemo(() => calculateXExtents(plotData), [plotData]);
  const yScaleDomain = useMemo(() => calculateYScaleDomain(plotData), [plotData]);
  const atmIV = useMemo(() => calculateAtmIV(plotData), [plotData]);

  const xMax = width ? width - margin.left - margin.right : 0;
  const yMax = height ? height - margin.top - margin.bottom : 0;

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: xExtents,
        range: [0, xMax],
      }),
    [xMax, xExtents],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: yScaleDomain,
        range: [yMax, 0], // yMax is bottom, 0 is top
        nice: true,
      }),
    [yMax, yScaleDomain],
  );

  if (!width || !height || processedChartData.length === 0) {
    return (
      <div ref={parentRef} className={styles.noData} style={{ width: '100%', height: '100%' }}>
        <Text>No data available</Text>
      </div>
    );
  }

  const circleYPosition = yMax; // Place circles at the bottom edge

  return (
    <div ref={parentRef} style={{ width: '100%', height: '100%' }}>
      <svg style={{ width: '100%', height: '100%' }}>
        <Group left={margin.left} top={margin.top}>
          {/* Axes */}
          <AxisBottom
            top={yMax}
            scale={xScale}
            numTicks={5}
            tickFormat={value => `${(value.valueOf() * 100).toFixed(0)}Δ`}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'middle',
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={value => `${value.valueOf().toFixed(1)}%`}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
            })}
          />

          {/* Grid Lines */}
          <Line
            from={{ x: xScale(0.5), y: 0 }}
            to={{ x: xScale(0.5), y: yMax }}
            stroke={COLORS.grid.atm}
            strokeWidth={1}
            strokeDasharray="4,2"
            strokeOpacity={0.7}
            pointerEvents="none"
          />
          {atmIV !== null && yScaleDomain[0] <= atmIV && atmIV <= yScaleDomain[1] && (
            <Line
              from={{ x: 0, y: yScale(atmIV) }}
              to={{ x: xMax, y: yScale(atmIV) }}
              stroke={COLORS.grid.atm}
              strokeWidth={1}
              strokeDasharray="4,2"
              strokeOpacity={0.7}
              pointerEvents="none"
            />
          )}

          {/* Data Lines */}
          <LinePath
            data={plotData.callData}
            x={d => xScale(d.delta)}
            y={d => yScale(d.iv)}
            stroke={COLORS.series.call}
            strokeWidth={1.5}
            curve={curveMonotoneX}
          />
          <LinePath
            data={plotData.putData}
            x={d => xScale(d.delta)}
            y={d => yScale(d.iv)}
            stroke={COLORS.series.put}
            strokeWidth={1.5}
            curve={curveMonotoneX}
          />

          {/* Comparison Circles */}
          {comparisonCircles.map((circle, i) => (
            <circle
              key={`comp-circle-${i}`}
              cx={xScale(circle.delta)}
              cy={circleYPosition}
              r={circle.radius}
              fill={circle.color}
              stroke={COLORS.background}
              strokeWidth={0.5}
            />
          ))}
        </Group>
      </svg>
    </div>
  );
};

export const VolatilitySkewChart: React.FC = () => {
  const styles = useStyles();
  const [symbol, setSymbol] = React.useState<string>('QQQ');
  // Cast the hook result to the defined interface for better type safety
  const { sentimentBySymbolAndExpiration } = useSentiment2() as {
    sentimentBySymbolAndExpiration: SentimentHookData;
  };

  const expirationDates = useMemo(
    () => sentimentBySymbolAndExpiration[symbol]?.expirationDates || [],
    [sentimentBySymbolAndExpiration, symbol],
  );

  const firstExpiration = useMemo(
    () => (expirationDates.length > 0 ? expirationDates[0] : ''),
    [expirationDates],
  );

  const secondExpiration = useMemo(
    () => (expirationDates.length > 1 ? expirationDates[1] : ''),
    [expirationDates],
  );

  // Use the pure extraction function within useMemo
  const firstExpirationData = useMemo(
    () => extractExpirationData(sentimentBySymbolAndExpiration, symbol, firstExpiration),
    [sentimentBySymbolAndExpiration, symbol, firstExpiration],
  );

  const secondExpirationData = useMemo(
    () => extractExpirationData(sentimentBySymbolAndExpiration, symbol, secondExpiration),
    [sentimentBySymbolAndExpiration, symbol, secondExpiration],
  );

  return (
    <div className={styles.root} style={{ backgroundColor: 'transparent', border: 'none' }}>
      <div className={styles.chartsContainer}>
        {/* First Expiration Chart */}
        {firstExpiration && firstExpirationData.length > 0 && (
          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                }}>{`${symbol} (${formatDate(firstExpiration)})`}</div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {SYMBOL_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    style={{
                      color: symbol === option ? '#fff' : COLORS.axis.text,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: '0 4px',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={symbol === option}
                    tabIndex={0}
                    onClick={() => setSymbol(option)}>
                    [{option.toLowerCase()}]
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
            </div>
            <div className={styles.chartContainer}>
              <SingleVolatilitySkewChart chartData={firstExpirationData} />
            </div>
          </div>
        )}

        {/* Second Expiration Chart */}
        {secondExpiration && secondExpirationData.length > 0 && (
          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                }}>{`${symbol} (${formatDate(secondExpiration)})`}</div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {SYMBOL_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    style={{
                      color: symbol === option ? '#fff' : COLORS.axis.text,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: '0 4px',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={symbol === option}
                    tabIndex={0}
                    onClick={() => setSymbol(option)}>
                    [{option.toLowerCase()}]
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
            </div>
            <div className={styles.chartContainer}>
              <SingleVolatilitySkewChart chartData={secondExpirationData} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
