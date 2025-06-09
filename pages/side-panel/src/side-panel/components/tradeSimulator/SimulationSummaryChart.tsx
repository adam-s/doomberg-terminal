import React, { useMemo } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { useParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { useSimulationSummary } from '@src/side-panel/hooks/simulation/useSimulationSummary';

// Color constants matching the Sentiment component
const chartColors = {
  axis: { line: '#777', text: '#777' },
  series: '#2899f5', // Main series color
  grid: {
    zeroLine: '#8A8886',
    dashed: '#555555',
  },
  arrow: {
    up: '#8bd100', // Green color for positive/up (from Sentiment.tsx)
    down: '#f25022', // Red color for negative/down (from Sentiment.tsx)
    neutral: '#777', // Neutral color
  },
  background: 'rgba(0, 0, 0, 0.3)', // Background color for boxes
};

const margin = { top: 10, right: 10, bottom: 30, left: 40 };

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    position: 'relative',
    padding: '10px 10px 10px 10px', // Reduced top padding
    boxSizing: 'border-box',
  },
  chartContainer: {
    width: '100%',
    height: '100%',
  },
  noData: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '12px',
    color: chartColors.axis.text,
  },
  differenceBox: {
    // For positioning adjustments if needed
  },
  differenceText: {
    fontSize: '12px', // Match Sentiment.tsx
    fontWeight: 600,
    fontFamily: 'Arial, sans-serif',
  },
  arrowText: {
    marginTop: '-1.5px', // Match Sentiment.tsx
    marginLeft: '8px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'Arial, sans-serif',
    lineHeight: 1,
    transition: 'color 0.3s ease',
    display: 'inline-block',
    verticalAlign: 'middle',
  },
});

export const SimulationSummaryChart: React.FC = () => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  // Use differenceData from the hook (already smoothed)
  const { differenceData } = useSimulationSummary();

  const shouldRender = width > 0 && height > 0 && differenceData.length > 1;
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom - 20;

  const xScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [0, Math.max(1, differenceData.length - 1)],
      range: [0, xMax],
    });
  }, [differenceData.length, xMax]);

  const yScale = useMemo(() => {
    // Default domain if no data or not rendering
    let domainMin = -0.25;
    let domainMax = 0.25;

    if (shouldRender) {
      const differences = differenceData.map(d => d.difference);
      const dataMin = Math.min(...differences);
      const dataMax = Math.max(...differences);

      // Ensure the domain includes at least [-0.25, 0.25]
      domainMin = Math.min(-0.25, dataMin);
      domainMax = Math.max(0.25, dataMax);

      // If min equals max after adjustments, add a small buffer
      if (domainMin === domainMax) {
        domainMin -= 0.1; // Adjust buffer as needed
        domainMax += 0.1; // Adjust buffer as needed
      }
    }

    return scaleLinear<number>({
      domain: [domainMin, domainMax],
      range: [yMax, 0],
      nice: true, // `nice` helps create human-friendly tick values
    });
  }, [differenceData, yMax, shouldRender]);

  // Helper function to split line segments based on sign (positive/negative)
  const splitSegmentsBySign = (
    data: { index: number; difference: number }[],
  ): Array<{
    points: { index: number; difference: number }[];
    isPositive: boolean;
  }> => {
    if (data.length === 0) return [];

    const segments: Array<{
      points: { index: number; difference: number }[];
      isPositive: boolean;
    }> = [];

    let currentSegment = {
      points: [data[0]],
      isPositive: data[0].difference >= 0,
    };

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const prevSign = prev.difference >= 0;
      const currSign = curr.difference >= 0;

      if (currSign === prevSign) {
        currentSegment.points.push(curr);
      } else {
        // Interpolate the zero crossing for a smooth color transition
        const t = prev.difference / (prev.difference - curr.difference);
        const zeroIndex = prev.index + t * (curr.index - prev.index);
        const zeroPoint = { index: zeroIndex, difference: 0 };

        currentSegment.points.push(zeroPoint);
        segments.push(currentSegment);

        // Start new segment with zero crossing
        currentSegment = {
          points: [zeroPoint, curr],
          isPositive: currSign,
        };
      }
    }

    segments.push(currentSegment);
    return segments;
  };

  const lineSegments = useMemo(() => splitSegmentsBySign(differenceData), [differenceData]);

  const currentDifferenceInfo = useMemo(() => {
    if (differenceData.length === 0) return null;

    // We need the last 4 data points to determine the trend
    const lastPoints = differenceData.slice(-4);
    if (lastPoints.length < 2)
      return {
        value: lastPoints[0].difference,
        arrow: '',
        arrowColor: chartColors.arrow.neutral,
      };

    const lastPoint = lastPoints[lastPoints.length - 1];
    const prevPoint = lastPoints[lastPoints.length - 2];

    // Calculate the trend direction
    const diff = lastPoint.difference - prevPoint.difference;

    let arrow = '';
    let arrowColor = chartColors.arrow.neutral;

    // Set arrow and color based on the trend direction
    if (diff > 0) {
      arrow = '▲';
      arrowColor = chartColors.arrow.up;
    } else if (diff < 0) {
      arrow = '▼';
      arrowColor = chartColors.arrow.down;
    } else {
      arrow = '→';
      arrowColor = chartColors.arrow.neutral;
    }

    return {
      value: lastPoint.difference,
      arrow,
      arrowColor,
    };
  }, [differenceData]);

  const getX = (d: { index: number; difference: number }): number => xScale(d.index);
  const getY = (d: { index: number; difference: number }): number => yScale(d.difference);

  const zeroY = yScale(0);

  return (
    <div ref={parentRef} className={styles.root}>
      <div className={styles.chartHeader}>
        <div>LONG - SHORT</div>
        {currentDifferenceInfo !== null && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              className={styles.differenceText}
              style={{
                color:
                  currentDifferenceInfo.value >= 0
                    ? chartColors.arrow.up // Green for positive
                    : chartColors.arrow.down, // Red for negative
              }}>
              {`${currentDifferenceInfo.value >= 0 ? '+' : ''}$${currentDifferenceInfo.value.toFixed(2)}`}
            </span>
            {currentDifferenceInfo.arrow && (
              <span
                className={styles.arrowText}
                style={{ color: currentDifferenceInfo.arrowColor }}>
                {currentDifferenceInfo.arrow}
              </span>
            )}
          </div>
        )}
      </div>

      {!shouldRender ? (
        <div className={styles.noData}>
          <Text>Waiting for simulation data...</Text>
        </div>
      ) : (
        <div className={styles.chartContainer}>
          <svg width="100%" height="100%">
            <Group left={margin.left} top={margin.top}>
              {/* Y-axis with limited ticks - match Sentiment.tsx */}
              <AxisLeft
                scale={yScale}
                numTicks={5}
                stroke={chartColors.axis.line}
                tickStroke={chartColors.axis.line}
                tickLabelProps={() => ({
                  fill: chartColors.axis.text,
                  fontSize: 10,
                  textAnchor: 'end',
                  dy: '0.33em',
                })}
                tickFormat={value => {
                  const numericValue = value.valueOf();
                  return `$${numericValue.toFixed(2)}`;
                }}
              />

              {/* Horizontal dashed grid lines at each tick (excluding zero) */}
              {yScale
                .ticks(2)
                .filter(tick => tick !== 0) // Don't draw a regular grid line if it's 0
                .map(tick => (
                  <Line
                    key={`grid-line-${tick}`}
                    from={{ x: 0, y: yScale(tick) }}
                    to={{ x: xMax, y: yScale(tick) }}
                    stroke={chartColors.axis.line}
                    strokeDasharray="4,4"
                    strokeWidth={0.5}
                    pointerEvents="none"
                  />
                ))}

              {/* Explicit dashed line at Y=0 - Always render */}
              <Line
                key="zero-line"
                from={{ x: 0, y: zeroY }}
                to={{ x: xMax, y: zeroY }}
                stroke={chartColors.grid.zeroLine} // Use zero line color
                strokeDasharray="4,4" // Dashed line
                strokeWidth={0.7} // Slightly thicker for emphasis
                pointerEvents="none"
                // Clip the line to the chart bounds if needed, though SVG usually handles this
                // clipPath={`url(#clip-path-${/* unique id */})`} // Example if explicit clipping is desired
              />

              {/* Draw line segments with different colors based on sign */}
              {lineSegments.map((segment, idx) => (
                <LinePath
                  key={idx}
                  data={segment.points}
                  x={getX}
                  y={getY}
                  stroke={segment.isPositive ? chartColors.arrow.up : chartColors.arrow.down}
                  strokeWidth={1}
                  curve={curveMonotoneX}
                />
              ))}
            </Group>
          </svg>
        </div>
      )}
    </div>
  );
};
