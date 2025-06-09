import React, { useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { appleStock } from '@visx/mock-data';
import { randomWalk } from './chart-utils';

const WINDOW_SIZE = 30;
const UPDATE_INTERVAL = 1000; // 1 second

// Define the shape of a period’s data.
interface StockPeriod {
  period: number;
  close: number;
}

// Generate an initial array of 30 data points.
// We seed the random walk using appleStock’s first close value.
function generateInitialData(): StockPeriod[] {
  const initialData: StockPeriod[] = [];
  let lastClose = appleStock[0].close;
  for (let i = 0; i < WINDOW_SIZE; i++) {
    // Use a random walk within ±2% bounds.
    lastClose = randomWalk(lastClose, { min: lastClose * 0.98, max: lastClose * 1.02 });
    initialData.push({ period: i, close: lastClose });
  }
  return initialData;
}

export type DieterStockPriceProps = {
  width?: number;
  height?: number;
};

export default function DieterStockPrice({ width = 300, height = 100 }: DieterStockPriceProps) {
  // Initialize with 30 periods.
  const [periodData, setPeriodData] = useState<StockPeriod[]>(generateInitialData);

  // Every second, remove the oldest value and add a new one.
  useEffect(() => {
    const interval = setInterval(() => {
      setPeriodData(prevData => {
        const newData = prevData.slice(1);
        const lastClose = prevData[prevData.length - 1].close;
        const newClose = randomWalk(lastClose, { min: lastClose * 0.98, max: lastClose * 1.02 });
        newData.push({ period: prevData[prevData.length - 1].period + 1, close: newClose });
        return newData;
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Define chart margins.
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Compute the minimum and maximum close values for the current window.
  const closes = periodData.map(d => d.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);

  // Create scales.
  const xScale = scaleLinear<number>({
    domain: [0, periodData.length],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear<number>({
    domain: [minClose, maxClose],
    range: [innerHeight, 0],
  });

  // Define colors.
  const defaultColor = '#777';
  const highestColor = 'rgba(112,192,112,0.7)'; // muted green
  const lowestColor = 'rgba(192,112,112,0.7)'; // muted red

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
        {periodData.map((d, i) => {
          const x0 = xScale(i);
          const x1 = xScale(i + 1);
          const y = yScale(d.close);
          let stroke = defaultColor;
          if (d.close === maxClose) stroke = highestColor;
          else if (d.close === minClose) stroke = lowestColor;

          return (
            <line
              key={d.period}
              x1={x0}
              x2={x1}
              y1={y}
              y2={y}
              stroke={stroke}
              strokeWidth={1}
              style={{ transition: 'all 0.5s ease-out' }}
            />
          );
        })}
      </Group>
    </svg>
  );
}
