import React, { useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { curveBasis } from '@visx/curve';
import { DataPoint, randomWalk } from './chart-utils';

const initialData: DataPoint[] = [
  { x: 0, y: 0.1 },
  { x: 1, y: 0.3 },
  { x: 2, y: 0.6 },
  { x: 3, y: 0.8 },
  { x: 4, y: 0.7 },
  { x: 5, y: 0.5 },
  { x: 6, y: 0.6 },
  { x: 7, y: 0.9 },
  { x: 8, y: 1.0 },
];

export type DieterLineChartProps = {
  width?: number;
  height?: number;
};

export default function DieterLineChart({ width = 300, height = 100 }: DieterLineChartProps) {
  // Initialize state with the initial data points.
  const [data, setData] = useState<DataPoint[]>(initialData);

  // Every second, append a new data point using a random walk,
  // and remove the oldest data point to keep the array length constant.
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
        const lastPoint = prevData[prevData.length - 1];
        const newPoint: DataPoint = {
          x: lastPoint.x + 1,
          y: randomWalk(lastPoint.y),
        };
        // Remove the first element and append the new data point.
        return [...prevData.slice(1), newPoint];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Define margins for the axes.
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // x-scale based on the current data x-values.
  const xScale = scaleLinear<number>({
    domain: [Math.min(...data.map(d => d.x)), Math.max(...data.map(d => d.x))],
    range: [0, innerWidth],
  });

  // y-scale fixed from 0 to 1 (0% to 100%).
  const yScale = scaleLinear<number>({
    domain: [0, 1],
    range: [innerHeight, 0],
  });

  // Calculate the y position corresponding to 50%.
  const y50 = yScale(0.5) ?? 0;
  // Design tokens.
  const axisColor = '#777';
  const tickTextColor = '#555';
  const fontFamily = 'Arial, sans-serif';

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {/* X-Axis without ticks */}
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          tickValues={[]} // No ticks on the x-axis.
          stroke={axisColor}
        />
        {/* Y-Axis with ticks at 0, 0.5, and 1 (displayed as 0%, 50%, 100%) */}
        <AxisLeft
          scale={yScale}
          tickValues={[0, 0.5, 1]}
          tickFormat={val => `${(val as number) * 100}%`}
          stroke={axisColor}
          tickLabelProps={() => ({
            fill: tickTextColor,
            fontSize: 10,
            textAnchor: 'end',
            fontFamily,
          })}
        />
        {/* Dashed horizontal line at 50% */}
        <line
          x1={0}
          y1={y50}
          x2={innerWidth}
          y2={y50}
          stroke={axisColor}
          strokeDasharray="4,2"
          strokeOpacity={0.8}
        />
        {/* Main line path with a smooth curve */}
        <LinePath<DataPoint>
          data={data}
          x={d => xScale(d.x) ?? 0}
          y={d => yScale(d.y) ?? 0}
          curve={curveBasis}
          stroke={axisColor}
          strokeWidth={1}
          fill="none"
        />
      </Group>
    </svg>
  );
}
