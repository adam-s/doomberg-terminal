/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useMemo, useCallback, useRef, useState } from 'react';
import { makeStyles, Text, Spinner, Button } from '@fluentui/react-components';
import { useOpenInterestData } from '../../hooks/useOpenInterestData';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { Bar, Line } from '@visx/shape';
import { useParentSize } from '@visx/responsive';
import { defaultStyles, TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { OpenInterestStrike } from '@src/services/openInterest/openInterestData.service';
import { voronoi } from '@visx/delaunay';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    padding: '5px',
    boxSizing: 'border-box',
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    flexShrink: 0,
    marginBottom: '8px',
  },
  content: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  symbolSection: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 0 0',
    padding: '5px',
    boxSizing: 'border-box',
  },
  chartBlock: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 0 0',
  },
  chartContainer: {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
});

interface CombinedStrikeData {
  strikePrice: number;
  callOpenInterest: number;
  putOpenInterest: number;
}

interface StrikeBarChartProps {
  data: CombinedStrikeData[];
  width: number;
  height: number;
  symbol: string;
  expirationDate: string;
  lastTradePrice: number;
}

interface TooltipData {
  strikePrice: number;
  callOpenInterest: number;
  putOpenInterest: number;
}

const combineAndValidateData = (
  callData: OpenInterestStrike[],
  putData: OpenInterestStrike[],
): CombinedStrikeData[] => {
  const strikePriceMap = new Map<number, CombinedStrikeData>();

  callData.forEach(call => {
    strikePriceMap.set(call.strikePrice, {
      strikePrice: call.strikePrice,
      callOpenInterest: call.openInterest,
      putOpenInterest: 0,
    });
  });

  putData.forEach(put => {
    const existing = strikePriceMap.get(put.strikePrice);
    if (existing) {
      existing.putOpenInterest = put.openInterest;
    } else {
      strikePriceMap.set(put.strikePrice, {
        strikePrice: put.strikePrice,
        callOpenInterest: 0,
        putOpenInterest: put.openInterest,
      });
    }
  });

  return Array.from(strikePriceMap.values());
};

const BAR_WIDTH = 2; // Fixed bar width in pixels

// Add constant for line style
const LAST_PRICE_LINE_STYLE = {
  width: 2,
  color: 'rgba(255, 255, 255, 0.7)', // semi-transparent off-white
};

const StrikeBarChart: React.FC<StrikeBarChartProps> = ({
  data,
  width,
  height,
  symbol,
  expirationDate,
  lastTradePrice,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const {
    showTooltip,
    hideTooltip,
    tooltipTop = 0,
    tooltipLeft = 0,
    tooltipData,
  } = useTooltip<TooltipData>();

  const margin = { top: 0, right: 0, bottom: 0, left: 0 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const sortedData = useMemo(() => [...data].sort((a, b) => a.strikePrice - b.strikePrice), [data]);

  const xScale = useMemo(() => {
    const domain =
      sortedData.length > 0
        ? [sortedData[0].strikePrice, sortedData[sortedData.length - 1].strikePrice]
        : [0, 0];

    return scaleLinear<number>({
      range: [0, innerWidth],
      domain,
      nice: true,
    });
  }, [sortedData, innerWidth]);

  const yMax = Math.max(...sortedData.flatMap(d => [d.callOpenInterest, d.putOpenInterest]));

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [innerHeight, 0],
        domain: [0, yMax],
        nice: true,
      }),
    [yMax, innerHeight],
  );

  // Create Voronoi diagram for finding nearest strike price
  const voronoiDiagram = useMemo(() => {
    if (sortedData.length === 0) return null;

    return voronoi<CombinedStrikeData>({
      data: sortedData,
      x: d => xScale(d.strikePrice),
      y: () => height / 2, // Use middle of chart for y-axis since we only care about x distance
      width,
      height,
    });
  }, [sortedData, width, height, xScale]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!svgRef.current || !voronoiDiagram) return;

      const point = localPoint(svgRef.current, event);
      if (!point) return;

      const closest = voronoiDiagram.delaunay.find(point.x, point.y);
      if (closest !== null) {
        const strike = sortedData[closest];
        setHoveredStrike(strike.strikePrice);

        // Show tooltip only if there's open interest
        if (strike.callOpenInterest > 0 || strike.putOpenInterest > 0) {
          showTooltip({
            tooltipData: {
              strikePrice: strike.strikePrice,
              callOpenInterest: strike.callOpenInterest,
              putOpenInterest: strike.putOpenInterest,
            },
            tooltipLeft: xScale(strike.strikePrice),
            tooltipTop: point.y,
          });
        } else {
          hideTooltip();
        }
      }
    },
    [voronoiDiagram, sortedData, xScale, showTooltip, hideTooltip],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredStrike(null);
    hideTooltip();
  }, [hideTooltip]);

  return (
    <>
      <svg
        width={width}
        height={height}
        ref={svgRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}>
        <Group left={margin.left} top={margin.top}>
          {sortedData.map(d => (
            <Group
              key={`${symbol}-${expirationDate}-${d.strikePrice}`}
              transform={`translate(${xScale(d.strikePrice) - BAR_WIDTH}, 0)`}>
              <Bar
                x={0}
                y={yScale(d.callOpenInterest)}
                width={BAR_WIDTH}
                height={innerHeight - yScale(d.callOpenInterest)}
                fill="#8bd100"
                opacity={hoveredStrike === d.strikePrice ? 1 : 0.8}
              />
              <Bar
                x={BAR_WIDTH}
                y={yScale(d.putOpenInterest)}
                width={BAR_WIDTH}
                height={innerHeight - yScale(d.putOpenInterest)}
                fill="#f25022"
                opacity={hoveredStrike === d.strikePrice ? 1 : 0.8}
              />
            </Group>
          ))}
          <Line
            from={{ x: xScale(lastTradePrice), y: 0 }}
            to={{ x: xScale(lastTradePrice), y: innerHeight }}
            stroke={LAST_PRICE_LINE_STYLE.color}
            strokeWidth={LAST_PRICE_LINE_STYLE.width}
            pointerEvents="none"
          />
        </Group>
      </svg>
      {tooltipData && (
        <TooltipWithBounds
          style={{
            ...defaultStyles,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '3px',
            color: 'white',
            fontSize: '12px',
            padding: '8px',
            pointerEvents: 'none',
          }}
          top={tooltipTop}
          left={tooltipLeft}>
          <div>
            <div>Strike: ${tooltipData.strikePrice.toFixed(2)}</div>
            <div>Call OI: {tooltipData.callOpenInterest.toLocaleString()}</div>
            <div>Put OI: {tooltipData.putOpenInterest.toLocaleString()}</div>
          </div>
        </TooltipWithBounds>
      )}
    </>
  );
};

interface ResponsiveStrikeBarChartProps {
  data: CombinedStrikeData[];
  symbol: string;
  expirationDate: string;
  lastTradePrice: number;
}

export const ResponsiveStrikeBarChart: React.FC<ResponsiveStrikeBarChartProps> = ({
  data,
  symbol,
  expirationDate,
  lastTradePrice,
}) => {
  const { width, parentRef } = useParentSize();
  return (
    <div ref={parentRef} style={{ width: '100%', height: '100%' }}>
      {width > 0 && (
        <StrikeBarChart
          data={data}
          symbol={symbol}
          expirationDate={expirationDate}
          width={width}
          height={50}
          lastTradePrice={lastTradePrice}
        />
      )}
    </div>
  );
};

export const OpenInterestChart: React.FC = () => {
  const styles = useStyles();

  const symbols = useMemo(() => ['SPY', 'QQQ', 'DIA'], []);
  const { openInterestData, isLoading, error, refreshData } = useOpenInterestData(symbols);

  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.spinnerContainer}>
          <Text color="error">Error: {error}</Text>
          <Button onClick={() => refreshData()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.spinnerContainer}>
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size={500}>Open Interest</Text>
        <Button onClick={() => refreshData(true)} size="small" style={{ float: 'right' }}>
          Refresh
        </Button>
      </div>
      <div className={styles.content}>
        {symbols.map(symbol => {
          const symbolData = openInterestData[symbol];
          if (!symbolData) return null;

          const expirationDates = Object.keys(symbolData.dates);
          return (
            <div key={symbol} className={styles.symbolSection}>
              <Text size={200} weight="semibold" style={{ marginBottom: '2px' }}>
                {symbol} - ${symbolData.lastTradePrice.toFixed(2)}
              </Text>
              <div>
                {expirationDates.map(date => {
                  const dateData = symbolData.dates[date];
                  const combinedData = combineAndValidateData(dateData.call, dateData.put);
                  return (
                    <div key={date} className={styles.chartBlock}>
                      <Text size={100}>{date}</Text>
                      <div className={styles.chartContainer}>
                        <ResponsiveStrikeBarChart
                          data={combinedData}
                          symbol={symbol}
                          expirationDate={date}
                          lastTradePrice={symbolData.lastTradePrice}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
