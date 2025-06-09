import React from 'react';
import { Group } from '@visx/group';
import { AxisLeft, AxisBottom } from '@visx/axis'; // <-- Added axis imports
import { curveBasis } from '@visx/curve';
import { LinePath } from '@visx/shape';
import { Threshold } from '@visx/threshold';
import { scaleLinear } from '@visx/scale';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

const MARGIN = { top: 20, right: 20, bottom: 20, left: 45 };

const COLORS = {
  axis: { line: '#a6a6a6', text: '#fff' },
  grid: { line: '#6d6d6d', zero: '#929292' },
  series: {
    call: { line: '#8bd100', area: 'rgba(139,209,0,0.4)' },
    put: { line: '#f25022', area: 'rgba(242,80,34,0.4)' },
  },
};

interface FlowDataPoint {
  index: number;
  call: number;
  put: number;
}

export type FlowThresholdProps = {
  width?: number;
  height?: number;
  symbol?: string;
};

interface HistoricalTotals {
  [key: string]: {
    call: number[];
    put: number[];
  };
}

function getFirstHistoricalTotal(totals: HistoricalTotals): {
  expDate?: string;
  flows?: { call: number[]; put: number[] };
} {
  const entries = Object.entries(totals ?? {});
  if (entries.length === 0) {
    return {};
  }
  const [expDate, flows] = entries[0];
  return { expDate, flows };
}

export default function FlowThreshold({
  width = 300,
  height = 100,
  symbol = 'QQQ',
}: FlowThresholdProps) {
  const { flowBySymbol } = useExtrinsicValueData();
  const historicalTotals = flowBySymbol?.[symbol]?.['historicalFlowTotals'];
  const { expDate, flows } = getFirstHistoricalTotal(historicalTotals);

  if (!flows || width < 10) return null;

  // Prepare the data points
  const data: FlowDataPoint[] = flows.call.map((call, i) => ({
    index: i,
    call,
    put: flows.put[i],
  }));

  // Calculate dimensions and scales
  const xMax = width - MARGIN.left - MARGIN.right;
  const yMax = height - MARGIN.top - MARGIN.bottom;

  const allValues = [...flows.call, ...flows.put];
  const maxValue = Math.max(...allValues, 0);

  const xScale = scaleLinear({ domain: [0, data.length - 1], range: [0, xMax] });
  const yScale = scaleLinear({ domain: [0, maxValue * 1.1], range: [yMax, 0] });

  return (
    <svg width={width} height={height}>
      <Group left={MARGIN.left} top={MARGIN.top}>
        {/* X-Axis without ticks */}
        <AxisBottom top={yMax} scale={xScale} tickValues={[]} stroke="#777" />
        {/* Y-Axis with ticks at 0, maxValue/2, maxValue */}
        <AxisLeft
          scale={yScale}
          tickValues={[0, maxValue / 2, maxValue]}
          tickFormat={val => val.valueOf().toFixed(2)}
          stroke="#777"
          tickLabelProps={() => ({
            fill: '#555',
            fontSize: 10,
            textAnchor: 'end',
            fontFamily: 'Arial, sans-serif',
          })}
        />
        <Threshold<FlowDataPoint>
          id={`flow-threshold-${expDate}`}
          data={data}
          x={d => xScale(d.index) ?? 0}
          y0={d => yScale(d.put) ?? 0}
          y1={d => yScale(d.call) ?? 0}
          clipAboveTo={0}
          clipBelowTo={yMax}
          curve={curveBasis}
          aboveAreaProps={{
            fill: COLORS.series.put.area,
            fillOpacity: 0.4,
          }}
          belowAreaProps={{
            fill: COLORS.series.call.area,
            fillOpacity: 0.4,
          }}
        />
        <LinePath<FlowDataPoint>
          data={data}
          x={d => xScale(d.index) ?? 0}
          y={d => yScale(d.call) ?? 0}
          stroke={COLORS.series.call.line}
          strokeWidth={1}
          curve={curveBasis}
        />
        <LinePath<FlowDataPoint>
          data={data}
          x={d => xScale(d.index) ?? 0}
          y={d => yScale(d.put) ?? 0}
          stroke={COLORS.series.put.line}
          strokeWidth={1}
          curve={curveBasis}
        />
      </Group>
    </svg>
  );
}
