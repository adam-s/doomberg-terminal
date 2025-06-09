import React from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { scaleLinear } from '@visx/scale';
import { curveBasis } from '@visx/curve';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';
import {
  AreaTimeSeriesByExpiration,
  AreaTimeSeries,
} from '@src/services/extrinsicValue/extrinsicValueUtils';

const COLORS = {
  call: '#8bd100',
  put: '#f25022',
  volatile: '#555',
};

const DESIGN_TOKENS = {
  axis: {
    color: '#777',
    text: '#555',
    font: 'Arial, sans-serif',
  },
};

export type DataPoint = { x: number; y: number };

function getFirstHistoricalTotal(totals: AreaTimeSeriesByExpiration | undefined): {
  expDate?: string;
  flows?: AreaTimeSeries;
} {
  if (!totals) return {};
  const entries = Object.entries(totals);
  if (entries.length === 0) return {};
  const [expDate, flows] = entries[0];
  return { expDate, flows };
}

export type AreaLineChartProps = {
  width?: number;
  height?: number;
  symbol?: string;
};

export const AreaLineChart: React.FC<AreaLineChartProps> = ({
  width = 300,
  height = 100,
  symbol = 'QQQ',
}) => {
  const { flowBySymbol } = useExtrinsicValueData();
  const computedAreas = flowBySymbol?.[symbol]?.computedAreasData;
  const { flows } = getFirstHistoricalTotal(computedAreas);
  if (!flows || !Array.isArray(flows.greenArea) || !Array.isArray(flows.redArea) || width < 10) {
    return null;
  }
  const callsData: DataPoint[] = flows.greenArea.map((value, i) => ({ x: i, y: value }));
  const putsData: DataPoint[] = flows.redArea.map((value, i) => ({ x: i, y: value }));
  const volatileData: DataPoint[] = flows.beneathArea.map((value, i) => ({ x: i, y: value }));
  const margin = { top: 20, right: 20, bottom: 20, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxX = Math.max(callsData.length, putsData.length) - 1;
  const xScale = scaleLinear<number>({
    domain: [0, maxX],
    range: [0, innerWidth],
  });
  const yScale = scaleLinear<number>({
    domain: [0, 100],
    range: [innerHeight, 0],
  });
  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          tickValues={[]}
          stroke={DESIGN_TOKENS.axis.color}
        />
        <AxisLeft
          scale={yScale}
          tickValues={[0, 50, 100]}
          tickFormat={val => `${val as number}%`}
          stroke={DESIGN_TOKENS.axis.color}
          tickLabelProps={() => ({
            fill: DESIGN_TOKENS.axis.text,
            fontSize: 10,
            textAnchor: 'end',
            fontFamily: DESIGN_TOKENS.axis.font,
          })}
        />
        <line
          x1={0}
          y1={yScale(50)}
          x2={innerWidth}
          y2={yScale(50)}
          stroke={DESIGN_TOKENS.axis.color}
          strokeDasharray="4,2"
          strokeOpacity={0.8}
        />
        <LinePath<DataPoint>
          data={callsData}
          x={d => xScale(d.x) ?? 0}
          y={d => yScale(d.y) ?? 0}
          curve={curveBasis}
          stroke={COLORS.call}
          strokeWidth={1}
          fill="none"
        />
        <LinePath<DataPoint>
          data={putsData}
          x={d => xScale(d.x) ?? 0}
          y={d => yScale(d.y) ?? 0}
          curve={curveBasis}
          stroke={COLORS.put}
          strokeWidth={1}
          fill="none"
        />
        <LinePath<DataPoint>
          data={volatileData}
          x={d => xScale(d.x) ?? 0}
          y={d => yScale(d.y) ?? 0}
          curve={curveBasis}
          stroke={COLORS.volatile}
          strokeWidth={1}
          fill="none"
        />
      </Group>
    </svg>
  );
};

export default AreaLineChart;
