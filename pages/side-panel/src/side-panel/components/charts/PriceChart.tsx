import React, { useMemo } from 'react';
import { useParentSize } from '@visx/responsive';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { GridRows } from '@visx/grid';
import { useExtrinsicValueData } from '../../hooks/useExtrinsicValueFlows';

// Define chart colors
const chartColors = {
  axis: { line: '#777', text: '#777' },
  series: '#2899f5', // QQQ line color
  grid: {
    zeroLine: '#8A8886',
    dashed: '#555555', // Color for whole dollar grid lines
  },
};

// Define margins
const margin = { top: 10, right: 10, bottom: 30, left: 40 };

// The symbol we're displaying
const DISPLAY_SYMBOL = 'QQQ';

// Interface for data points
interface PriceDataPoint {
  index: number;
  price: number;
}

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '150px', // Fixed height for the chart
    position: 'relative',
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
});

export const PriceChart: React.FC = () => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  const { flowBySymbol } = useExtrinsicValueData();

  const qqqData: PriceDataPoint[] = useMemo(() => {
    const symbolData = flowBySymbol[DISPLAY_SYMBOL];
    if (!symbolData || !symbolData.tradePrices || symbolData.tradePrices.length === 0) {
      return [];
    }

    // Create data points from tradePrices array
    return symbolData.tradePrices.map((price, index) => ({
      index,
      price,
    }));
  }, [flowBySymbol]);

  const shouldRender = width > 0 && height > 0 && qqqData.length > 0;

  // Calculate dimensions
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [0, Math.max(1, qqqData.length - 1)],
      range: [0, xMax],
    });
  }, [qqqData.length, xMax]);

  const yScale = useMemo(() => {
    if (!shouldRender) return scaleLinear<number>({ domain: [0, 1], range: [yMax, 0] });

    const prices = qqqData.map(d => d.price);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);

    // Ensure the range is at least $1.00
    const priceRange = maxPrice - minPrice;
    if (priceRange < 1.0) {
      const midPoint = (minPrice + maxPrice) / 2;
      minPrice = midPoint - 0.5;
      maxPrice = midPoint + 0.5;
    }

    const padding = (maxPrice - minPrice) * 0.1 || 0.1; // Add padding, ensure non-zero padding if range was 0

    return scaleLinear<number>({
      domain: [minPrice - padding, maxPrice + padding],
      range: [yMax, 0],
      nice: true,
    });
  }, [qqqData, yMax, shouldRender]);

  // Calculate whole dollar price levels for grid lines
  const dollarPriceLevels = useMemo(() => {
    if (!shouldRender) return [];

    const [domainMin, domainMax] = yScale.domain();
    const floorMin = Math.floor(domainMin);
    const ceilMax = Math.ceil(domainMax);

    const levels: number[] = [];
    for (let price = floorMin; price <= ceilMax; price++) {
      // Only add whole number prices
      if (Number.isInteger(price)) {
        levels.push(price);
      }
    }

    return levels;
  }, [yScale, shouldRender]);

  // Current price display
  const currentPrice = useMemo(() => {
    if (qqqData.length === 0) return null;
    return qqqData[qqqData.length - 1].price;
  }, [qqqData]);

  // Accessor functions with explicit types
  const getX = (d: PriceDataPoint): number => xScale(d.index);
  const getY = (d: PriceDataPoint): number => yScale(d.price);

  return (
    <div ref={parentRef} className={styles.root}>
      {!shouldRender ? (
        <div className={styles.noData}>
          <Text>Loading price data...</Text>
        </div>
      ) : (
        <div className={styles.chartContainer}>
          <svg width="100%" height="100%">
            <Group left={margin.left} top={margin.top}>
              {/* Grid lines for whole dollar amounts */}
              <GridRows
                scale={yScale}
                width={xMax}
                stroke={chartColors.grid.dashed}
                strokeDasharray="3,3"
                strokeOpacity={0.3}
                tickValues={dollarPriceLevels}
              />

              {/* Y-axis */}
              <AxisLeft
                scale={yScale}
                numTicks={4}
                stroke={chartColors.axis.line}
                tickStroke={chartColors.axis.line}
                tickLabelProps={() => ({
                  fill: chartColors.axis.text,
                  fontSize: 10,
                  textAnchor: 'end',
                  dy: '0.33em',
                })}
                tickFormat={value => {
                  // Convert NumberValue to number using valueOf()
                  const numericValue = value.valueOf();
                  return `$${numericValue.toFixed(2)}`;
                }}
              />

              {/* Price Line */}
              <LinePath<PriceDataPoint>
                data={qqqData}
                x={getX}
                y={getY}
                stroke={chartColors.series}
                strokeWidth={1.5}
                curve={curveMonotoneX}
              />

              {/* Current Price Label */}
              {currentPrice && (
                <Group>
                  <rect
                    x={xMax - 90} // 60 * 1.5 = 90
                    y={1.5} // 3 * 0.5 = 1.5 (move up slightly for larger height)
                    width={90} // 60 * 1.5 = 90
                    height={24} // 16 * 1.5 = 24
                    fill="rgba(0, 0, 0, 0.3)"
                    rx={4.5} // 3 * 1.5 = 4.5
                  />
                  <text
                    x={xMax - 7.5} // 5 * 1.5 = 7.5
                    y={21} // 14 * 1.5 = 21
                    textAnchor="end"
                    fill={chartColors.series}
                    fontSize={13.5} // 9 * 1.5 = 13.5
                    fontFamily="Arial, sans-serif"
                    fontWeight={600}>
                    {`$${currentPrice.toFixed(2)}`}
                  </text>
                </Group>
              )}
            </Group>
          </svg>
        </div>
      )}
    </div>
  );
};
