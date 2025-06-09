import React from 'react';
import { Group } from '@visx/group';
import { AxisLeft, AxisBottom } from '@visx/axis'; // <-- Added axis imports
import { curveBasis } from '@visx/curve';
import { LinePath } from '@visx/shape';
import { Threshold } from '@visx/threshold';
import { scaleLinear } from '@visx/scale';
import { useParentSize } from '@visx/responsive';
import { type SymbolData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

const MARGIN = { top: 10, right: 0, bottom: 0, left: 50 }; // Reduced top and bottom margins

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

// Helper type to represent the data structure for a single expiration date's flow
type IndividualHistoricalFlow = NonNullable<SymbolData['historicalFlowTotals']>[string];

export interface FlowThresholdProps {
  // Changed from type to interface
  expDate: string;
  flow: IndividualHistoricalFlow | undefined; // Simplified flow type
  width?: number;
  height?: number;
  symbol?: string;
}

export function FlowThreshold({ expDate, flow }: FlowThresholdProps) {
  const { width, height, parentRef } = useParentSize();

  if (!flow) return null;

  // Prepare the data points
  const data: FlowDataPoint[] = flow.call.map((call, i) => ({
    index: i,
    call,
    put: flow.put[i],
  }));

  // Calculate dimensions and scales
  const xMax = width - MARGIN.left - MARGIN.right;
  const yMax = height - MARGIN.top - MARGIN.bottom;

  const allValues = [...flow.call, ...flow.put];
  const maxValue = Math.max(...allValues, 0);

  const xScale = scaleLinear({ domain: [0, data.length - 1], range: [0, xMax] });
  const yScale = scaleLinear({ domain: [0, maxValue * 1.1], range: [yMax, 0] });

  return (
    <div ref={parentRef} style={{ width: '100%', height: '60px' }}>
      <svg style={{ width: '100%', height: '100%' }}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* X-Axis without ticks */}
          <AxisBottom top={yMax} scale={xScale} tickValues={[]} stroke="#777" />
          {/* Y-Axis with exactly 3 ticks */}
          <AxisLeft
            scale={yScale}
            numTicks={3}
            stroke="#777"
            tickLabelProps={() => ({
              fill: '#777',
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
    </div>
  );
}
