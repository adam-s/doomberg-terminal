import React from 'react';
import { Group } from '@visx/group';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

// Removed constants and random walk function

export type PriceChannelProps = {
  width?: number;
  height?: number;
  symbol?: string;
};

export default function PriceChannel({
  width = 300,
  height = 100,
  symbol = 'QQQ',
}: PriceChannelProps) {
  const { flowBySymbol } = useExtrinsicValueData();
  // Use the tradePrices array from the hook; fallback to an empty array if undefined
  const tradePrices: number[] = flowBySymbol?.[symbol]?.tradePrices ?? [];
  // Map tradePrices to chart data points: period index and close price
  const chartData = tradePrices.map((price, index) => ({ period: index, close: price }));

  // Compute min and max, and determine the rightmost indices for each.
  const closes = chartData.map(d => d.close);
  const minClose = closes.length ? Math.min(...closes) : 0;
  const maxClose = closes.length ? Math.max(...closes) : 0;
  const maxIndex = chartData.map(d => d.close).lastIndexOf(maxClose);
  const minIndex = chartData.map(d => d.close).lastIndexOf(minClose);

  // Define chart margins.
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create scales.
  const xScale = scaleLinear<number>({
    domain: [0, chartData.length],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear<number>({
    domain: [minClose, maxClose],
    range: [innerHeight, 0],
  });

  const defaultColor = '#555555';
  const highestColor = '#8bd100';
  const lowestColor = '#f25022';

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {/* Y-axis with ticks at the current min and max */}
        <AxisLeft
          scale={yScale}
          tickValues={[minClose, maxClose]}
          tickFormat={val => val.valueOf().toFixed(2)}
          stroke="#777"
          tickLabelProps={() => ({
            fill: '#555',
            fontSize: 10,
            textAnchor: 'end',
          })}
        />
        {/* X-axis showing periods */}
        <AxisBottom top={innerHeight} scale={xScale} tickValues={[]} stroke={'#777'} />
        {/* Draw one horizontal line segment per period */}
        {chartData.map((d, i) => {
          const x0 = xScale(i);
          const x1 = xScale(i + 1);
          const y = yScale(d.close);
          let stroke = defaultColor;
          if (i === maxIndex) stroke = highestColor;
          else if (i === minIndex) stroke = lowestColor;

          return (
            <line key={d.period} x1={x0} x2={x1} y1={y} y2={y} stroke={stroke} strokeWidth={1} />
          );
        })}
      </Group>
    </svg>
  );
}
