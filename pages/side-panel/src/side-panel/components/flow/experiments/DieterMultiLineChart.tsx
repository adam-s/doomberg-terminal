import React, { useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { curveBasis } from '@visx/curve';

// Types and helpers
export type DataPoint = {
  x: number;
  y: number;
};

export function randomWalk(currentValue: number): number {
  const delta = (Math.random() - 0.5) * 0.1; // change up to ±0.05
  let newValue = currentValue + delta;
  if (newValue < 0) newValue = 0;
  if (newValue > 1) newValue = 1;
  return newValue;
}

type MultiLineData = {
  line1: DataPoint[];
  line2: DataPoint[];
  line3: DataPoint[];
};

// Generate initial random data for each line
const generateInitialData = (points: number): DataPoint[] =>
  Array.from({ length: points }, (_, i) => ({
    x: i,
    y: Math.random(),
  }));

const initialData: MultiLineData = {
  line1: generateInitialData(9),
  line2: generateInitialData(9),
  line3: generateInitialData(9),
};

const COLORS = {
  line1: '#7facd6',
  line2: '#8fb793',
  line3: '#c48a88',
};

export type DieterMultiLineChartProps = {
  width?: number;
  height?: number;
};

export default function DieterMultiLineChart({
  width = 300,
  height = 100,
}: DieterMultiLineChartProps) {
  const [data, setData] = useState<MultiLineData>(initialData);

  // Update each line by removing the oldest point and adding a new point
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
        const updateLine = (line: DataPoint[]): DataPoint[] => {
          const lastPoint = line[line.length - 1];
          const newPoint: DataPoint = {
            x: lastPoint.x + 1,
            y: randomWalk(lastPoint.y),
          };
          return [...line.slice(1), newPoint];
        };

        return {
          line1: updateLine(prevData.line1),
          line2: updateLine(prevData.line2),
          line3: updateLine(prevData.line3),
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Chart layout
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Collect all x-values from all lines to scale them together
  const allXValues = [...data.line1, ...data.line2, ...data.line3].map(d => d.x);

  const xScale = scaleLinear<number>({
    domain: [Math.min(...allXValues), Math.max(...allXValues)],
    range: [0, innerWidth],
  });

  // We know y ranges between 0 and 1 (due to randomWalk constraints)
  const yScale = scaleLinear<number>({
    domain: [0, 1],
    range: [innerHeight, 0],
  });

  // Add design tokens
  const axisColor = '#777';
  const y50 = yScale(0.5) ?? 0;

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        <AxisBottom top={innerHeight} scale={xScale} tickValues={[]} stroke={axisColor} />
        <AxisLeft
          scale={yScale}
          tickValues={[0, 0.5, 1]}
          tickFormat={val => `${(val as number) * 100}%`}
          stroke={axisColor}
          tickLabelProps={() => ({
            fill: '#555',
            fontSize: 10,
            textAnchor: 'end',
            fontFamily: 'Arial, sans-serif',
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

        {/* Render each line in a different color */}
        {Object.entries(data).map(([lineKey, lineData]) => (
          <LinePath<DataPoint>
            key={lineKey}
            data={lineData}
            x={d => xScale(d.x) ?? 0}
            y={d => yScale(d.y) ?? 0}
            curve={curveBasis}
            stroke={COLORS[lineKey as keyof typeof COLORS]}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Group>
    </svg>
  );
}
