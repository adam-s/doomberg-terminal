import React from 'react';
import { Group } from '@visx/group';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { curveBasis } from '@visx/curve';
import { LinePath } from '@visx/shape';
import { Threshold } from '@visx/threshold';
import { scaleLinear } from '@visx/scale';
import { useParentSize } from '@visx/responsive';
import { SymbolData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

const MARGIN = { top: 0, right: 0, bottom: 0, left: 50 };

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

export type AggregatedFlowThresholdProps = {
  symbolData: SymbolData;
  width?: number;
  height?: number;
  symbol?: string;
};

export function AggregatedFlowThreshold({
  symbolData,
  symbol = 'QQQ',
}: AggregatedFlowThresholdProps) {
  const { width, height, parentRef } = useParentSize();

  const aggregatedFlowData = symbolData.aggregatedFlowData;
  const calls = aggregatedFlowData?.calls;
  const puts = aggregatedFlowData?.puts;

  if (!calls || !puts) return null;

  const data: FlowDataPoint[] = calls.map((call, i) => ({
    index: i,
    call,
    put: puts[i],
  }));

  const xMax = width - MARGIN.left - MARGIN.right;
  const yMax = height - MARGIN.top - MARGIN.bottom;

  const allValues = [...calls, ...puts];
  const maxValue = Math.max(...allValues, 0);

  const xScale = scaleLinear<number>({ domain: [0, data.length - 1], range: [0, xMax] });
  const yScale = scaleLinear<number>({ domain: [0, maxValue * 1.1], range: [yMax, 0] });

  return (
    <div ref={parentRef} style={{ width: '100%', height: '60px' }}>
      <svg style={{ width: '100%', height: '100%' }}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <AxisBottom top={yMax} scale={xScale} tickValues={[]} stroke="#777" />
          <AxisLeft
            numTicks={3}
            scale={yScale}
            stroke="#777"
            tickLabelProps={() => ({
              fill: '#777',
              fontSize: 10,
              textAnchor: 'end',
              fontFamily: 'Arial, sans-serif',
            })}
          />
          <Threshold<FlowDataPoint>
            id={`flow-threshold-${symbol}`}
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
