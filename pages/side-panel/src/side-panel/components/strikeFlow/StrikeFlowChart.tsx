import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { Bar } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleBand, scaleLinear } from '@visx/scale';
import { useParentSize } from '@visx/responsive';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useStrikeFlows } from '../../hooks/useStrikeFlows';

const MARGIN = { top: 4, right: 4, bottom: 40, left: 40 };

const COLORS = {
  axis: { line: '#777', text: '#777' },
  series: {
    call: { line: '#8bd100', area: 'rgba(139,209,0,0.4)' },
    put: { line: '#f25022', area: 'rgba(242,80,34,0.4)' },
  },
  grid: { zeroLine: '#8A8886' },
  dashedLine: '#777',
};

interface StrikeFlowChartProps {
  symbol: string;
  expirationDateIndex: number;
  strikesToDisplayAroundLtp: number;
  deltasCount: number;
}

interface ChartDataPoint {
  strike: string;
  callValue: number;
  putValue: number;
}

const useStyles = makeStyles({
  messageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    textAlign: 'center',
  },
});

export function StrikeFlowChart({
  symbol,
  expirationDateIndex,
  strikesToDisplayAroundLtp,
  deltasCount,
}: StrikeFlowChartProps) {
  const styles = useStyles();
  const { width: parentWidth, height: parentHeight, parentRef } = useParentSize();
  const fallbackHeight = 206;
  const finalHeight = parentHeight > 0 ? parentHeight : fallbackHeight;

  const { flowsByExpirationAndStrike, lastTradePrice, isLoading, error } = useStrikeFlows(symbol);

  const expirationDates = useMemo(() => {
    if (!flowsByExpirationAndStrike) return [];
    return Object.keys(flowsByExpirationAndStrike).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [flowsByExpirationAndStrike]);
  const currentExpirationDate = expirationDates[expirationDateIndex] || '';
  const flowsForCurrentExpiration =
    flowsByExpirationAndStrike && currentExpirationDate
      ? flowsByExpirationAndStrike[currentExpirationDate]
      : undefined;

  // Always call hooks before any early return
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!flowsForCurrentExpiration) return [];
    const baseChartData: ChartDataPoint[] = Object.entries(flowsForCurrentExpiration)
      .map(([strike, aggregatedData]) => {
        const lastRecentCalls = aggregatedData.calls.slice(-deltasCount);
        const lastRecentPuts = aggregatedData.puts.slice(-deltasCount);
        return {
          strike,
          callValue: lastRecentCalls.reduce((sum, v) => sum + v, 0),
          putValue: lastRecentPuts.reduce((sum, v) => sum + v, 0),
        };
      })
      .sort((a, b) => parseFloat(a.strike) - parseFloat(b.strike));

    if (lastTradePrice !== undefined && baseChartData.length > 0) {
      let closestIndex = 0;
      let minDiff = Infinity;
      baseChartData.forEach((d, i) => {
        const diff = Math.abs(parseFloat(d.strike) - lastTradePrice);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      });
      const start = Math.max(0, closestIndex - strikesToDisplayAroundLtp);
      const end = Math.min(baseChartData.length - 1, closestIndex + strikesToDisplayAroundLtp);
      return baseChartData.slice(start, end + 1);
    }
    return baseChartData;
  }, [flowsForCurrentExpiration, lastTradePrice, strikesToDisplayAroundLtp, deltasCount]);

  const innerWidth = parentWidth > 0 ? parentWidth - MARGIN.left - MARGIN.right : 0;
  const innerHeight = finalHeight > 0 ? finalHeight - MARGIN.top - MARGIN.bottom : 0;

  if (isLoading) {
    return (
      <div ref={parentRef} style={{ width: '100%', height: `${finalHeight}px` }}>
        <div className={styles.messageContainer}>Loading strike data for {symbol}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={parentRef} style={{ width: '100%', height: `${finalHeight}px` }}>
        <div className={styles.messageContainer}>
          Error loading strike data for {symbol}: {error.message}
        </div>
      </div>
    );
  }

  if (!flowsForCurrentExpiration || Object.keys(flowsForCurrentExpiration).length === 0) {
    return (
      <div ref={parentRef} style={{ width: '100%', height: `${finalHeight}px` }}>
        <div className={styles.messageContainer}>No strike data available for {symbol}.</div>
      </div>
    );
  }

  if (chartData.length === 0 || innerWidth <= 0 || innerHeight <= 0) {
    return (
      <div ref={parentRef} style={{ width: '100%', height: `${finalHeight}px` }}>
        <div className={styles.messageContainer}>No displayable strike data for {symbol}.</div>
      </div>
    );
  }

  const yScale = scaleBand<string>({
    domain: [...chartData.map(d => d.strike)].reverse(),
    range: [0, innerHeight],
    padding: 0.3,
  });
  const maxCallAbs = Math.max(...chartData.map(d => Math.abs(d.callValue)), 0);
  const maxPut = Math.max(...chartData.map(d => d.putValue), 0);
  const xDomainExtent = Math.max(maxCallAbs, maxPut, 100);
  const xScale = scaleLinear<number>({
    domain: [-xDomainExtent, xDomainExtent],
    range: [0, innerWidth],
    nice: true,
  });
  const barBandwidth = yScale.bandwidth();

  let yPositionOfLTPLine: number | undefined;
  if (lastTradePrice !== undefined && barBandwidth > 0 && chartData.length > 0) {
    const closest = chartData.reduce(
      (prev, curr) => {
        const diff = Math.abs(parseFloat(curr.strike) - lastTradePrice);
        return diff < prev.diff ? { point: curr, diff } : prev;
      },
      { point: chartData[0], diff: Infinity },
    );
    const yPos = yScale(closest.point.strike);
    if (yPos !== undefined) yPositionOfLTPLine = yPos + barBandwidth / 2;
  }

  return (
    <div ref={parentRef} style={{ width: '100%', height: '100%' }}>
      <svg style={{ width: '100%', height: '100%' }}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <AxisLeft
            scale={yScale}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
            })}
            tickFormat={value => `$${value}`}
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            numTicks={innerWidth > 300 ? 5 : 3}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'middle',
            })}
            tickFormat={value => (value !== 0 ? Math.abs(value.valueOf()).toLocaleString() : '0')}
          />
          <line
            x1={xScale(0)}
            y1={0}
            x2={xScale(0)}
            y2={innerHeight}
            stroke={COLORS.grid.zeroLine}
            strokeWidth={1}
            strokeDasharray="4,2"
            strokeOpacity={0.7}
            pointerEvents="none"
          />
          {chartData.map(d => {
            const yPos = yScale(d.strike);
            if (yPos === undefined || barBandwidth <= 0) return null;
            return (
              <Group key={`${currentExpirationDate}-${d.strike}`}>
                {d.callValue !== 0 && (
                  <Bar
                    x={xScale(-Math.abs(d.callValue))}
                    y={yPos}
                    width={Math.abs(xScale(0) - xScale(-Math.abs(d.callValue)))}
                    height={barBandwidth}
                    fill={COLORS.series.call.line}
                  />
                )}
                {d.putValue !== 0 && (
                  <Bar
                    x={xScale(0)}
                    y={yPos}
                    width={Math.abs(xScale(d.putValue) - xScale(0))}
                    height={barBandwidth}
                    fill={COLORS.series.put.line}
                  />
                )}
              </Group>
            );
          })}
          {yPositionOfLTPLine !== undefined && (
            <line
              x1={0}
              y1={yPositionOfLTPLine}
              x2={innerWidth}
              y2={yPositionOfLTPLine}
              stroke={COLORS.dashedLine}
              strokeWidth={1}
              strokeDasharray="4,2"
              strokeOpacity={0.7}
              pointerEvents="none"
            />
          )}
        </Group>
      </svg>
    </div>
  );
}
