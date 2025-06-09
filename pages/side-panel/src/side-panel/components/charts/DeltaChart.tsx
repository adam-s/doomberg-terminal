import React, { useMemo } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { useHistoricals } from '../../hooks/useHistoricals';

interface DataPoint {
  x: number;
  y: number;
}

// Color constants matching the Flow theme (copied from Sentiment.tsx for consistency)
const COLORS = {
  axis: { line: '#777', text: '#777' },
  series: {
    sentiment: {
      line: '#8bd100',
      area: 'rgba(139,209,0,0.4)',
      positive: '#8bd100',
      negative: '#f25022',
    },
    sma: { line: '#2899f5' },
    composite: { line: '#ffb900', negative: '#f25022' },
  },
  grid: { zeroLine: '#8A8886' },
  background: 'rgba(0, 0, 0, 0.3)',
};

const SYMBOL_COLORS = {
  QQQ: COLORS.series.sma.line,
  SPY: COLORS.series.sentiment.positive,
  DIA: COLORS.series.composite.line,
} as const;

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    maxHeight: '225px',
  },
});

const margin = { top: 20, right: 10, bottom: 30, left: 55 };

// New Legend component:
const Legend: React.FC<{
  tickers: string[];
  width: number;
  data: Record<string, DataPoint[]>;
}> = ({ tickers, width, data }) => {
  const itemWidth = width / tickers.length - 10;
  return (
    <g transform={`translate(0,0)`}>
      {tickers.map((ticker, index) => {
        const currentValue = data[ticker]?.slice(-1)[0]?.y ?? 0;
        return (
          <g
            key={ticker}
            transform={`translate(${itemWidth * index + itemWidth / 2}, 0)`}
            style={{ fontSize: '10px' }}>
            <circle r={3} fill={SYMBOL_COLORS[ticker as keyof typeof SYMBOL_COLORS]} />
            <text
              dy=".25em"
              dx="6"
              fill={tokens.colorNeutralForeground2}
              style={{ fontFamily: 'inherit' }}>
              {ticker} {(currentValue.valueOf() * 100).toFixed(2)}%
            </text>
          </g>
        );
      })}
    </g>
  );
};

export const DeltaChart: React.FC = () => {
  const styles = useStyles();
  const { bidPricePercentChanges } = useHistoricals();
  const { parentRef, width, height } = useParentSize();

  const { processedData, yMin, yMax, dataLength } = useMemo<{
    processedData: Record<string, DataPoint[]>;
    yMin: number;
    yMax: number;
    dataLength: number;
  }>(() => {
    if (Object.keys(bidPricePercentChanges).length === 0) {
      return {
        processedData: {} as Record<string, DataPoint[]>,
        yMin: 0,
        yMax: 0,
        dataLength: 0,
      };
    }

    const processed: Record<string, DataPoint[]> = {};
    let minY: number = Infinity;
    let maxY: number = -Infinity;
    let maxLength: number = 0;

    Object.entries(bidPricePercentChanges).forEach(([symbol, changes]) => {
      const series = changes.map((change: number, index: number) => {
        minY = Math.min(minY, change);
        maxY = Math.max(maxY, change);
        return { x: index, y: change };
      });
      processed[symbol] = series;
      maxLength = Math.max(maxLength, changes.length);
    });
    // Ensure yMin/yMax always include at least -0.0011 and +0.0011
    const finalMinY = Math.min(minY, -0.0011);
    const finalMaxY = Math.max(maxY, 0.0011);
    return { processedData: processed, yMin: finalMinY, yMax: finalMaxY, dataLength: maxLength };
  }, [bidPricePercentChanges]);

  if (!width || !height || dataLength === 0) {
    return <div ref={parentRef} className={styles.root} />;
  }

  const xMaxScale = width - margin.left - margin.right;
  const yMaxScale = height - margin.top - margin.bottom;

  const xScale = scaleLinear({
    range: [0, xMaxScale],
    domain: [0, dataLength - 1],
  });

  const yScale = scaleLinear({
    range: [yMaxScale, 0],
    domain: [yMin, yMax],
    nice: true,
  });

  return (
    <div ref={parentRef} className={styles.root}>
      <svg width={width} height={height}>
        {/* Render Legend at the top-left of the chart area */}
        <g transform={`translate(${margin.left}, ${margin.top - 15})`}>
          <Legend
            tickers={Object.keys(processedData)}
            width={width - margin.left - margin.right}
            data={processedData}
          />
        </g>
        <Group left={margin.left} top={margin.top}>
          <AxisLeft
            scale={yScale}
            numTicks={5}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
            })}
            tickFormat={value => `${(value.valueOf() * 100).toFixed(2)}%`}
          />
          {/* Draw horizontal line at y=0 */}
          <Line
            from={{ x: 0, y: yScale(0) }}
            to={{ x: xMaxScale, y: yScale(0) }}
            stroke={COLORS.grid.zeroLine}
            strokeWidth={1}
            strokeOpacity={1}
            strokeDasharray="4,2"
          />
          {/* Draw horizontal line at y=+0.10% */}
          <Line
            from={{ x: 0, y: yScale(0.001) }}
            to={{ x: xMaxScale, y: yScale(0.001) }}
            stroke={COLORS.axis.line}
            strokeWidth={1}
            strokeOpacity={0.8}
            strokeDasharray="4,2"
          />
          {/* Draw horizontal line at y=-0.10% */}
          <Line
            from={{ x: 0, y: yScale(-0.001) }}
            to={{ x: xMaxScale, y: yScale(-0.001) }}
            stroke={COLORS.axis.line}
            strokeWidth={1}
            strokeOpacity={0.8}
            strokeDasharray="4,2"
          />
          {Object.entries(processedData).map(([symbol, series]) => (
            <LinePath<DataPoint>
              key={symbol}
              data={series}
              x={d => xScale(d.x)}
              y={d => yScale(d.y)}
              stroke={SYMBOL_COLORS[symbol as keyof typeof SYMBOL_COLORS] || COLORS.series.sma.line}
              strokeWidth={1}
              curve={curveMonotoneX}
            />
          ))}
        </Group>
      </svg>
    </div>
  );
};
