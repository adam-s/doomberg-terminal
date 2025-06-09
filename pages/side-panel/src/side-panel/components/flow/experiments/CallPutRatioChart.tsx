import React from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { curveBasis } from '@visx/curve';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

export type CallPutRatioChartProps = {
  width?: number;
  height?: number;
  symbol?: string;
};

export default function CallPutRatioChart({
  width = 300,
  height = 100,
  symbol = 'QQQ',
}: CallPutRatioChartProps) {
  const { flowBySymbol } = useExtrinsicValueData();
  // Use the callPutRatio array from the hook; fallback to an empty array if undefined
  const callPutRatio: number[] = flowBySymbol?.[symbol]?.callPutRatio ?? [];

  // Updated: map callPutRatio to chartData with period and close properties.
  const chartData = callPutRatio.map((ratio, index) => ({
    period: index,
    ratio,
  }));

  // Define margins for the axes.
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // x-scale based on the current chartData period values.
  const xScale = scaleLinear<number>({
    domain: [0, chartData.length > 0 ? chartData[chartData.length - 1].period : 0],
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
  const tickTextColor = '#777';
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
        <LinePath
          data={chartData}
          x={d => xScale(d.period) ?? 0}
          y={d => yScale(d.ratio / 100) ?? 0}
          curve={curveBasis}
          stroke={axisColor}
          strokeWidth={1.5}
          fill="none"
        />
      </Group>
    </svg>
  );
}
