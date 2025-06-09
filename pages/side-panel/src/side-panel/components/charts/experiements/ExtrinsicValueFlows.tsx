import React, { useMemo } from 'react';
import { useParentSize } from '@visx/responsive';
import { makeStyles, Text, Spinner } from '@fluentui/react-components';
import { Group } from '@visx/group';
import { curveBasis } from '@visx/curve';
import { LinePath, Line } from '@visx/shape';
import { Threshold } from '@visx/threshold';
import { scaleLinear } from '@visx/scale';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

//
// ─────────────────────────────────────────────────────────────────────────────
//   CONSTANTS & STYLES
// ─────────────────────────────────────────────────────────────────────────────
//

// Use a common margin for consistency with other components (like Dial)
const MARGIN = { top: 20, right: 10, bottom: 5, left: 10 };

const useStyles = makeStyles({
  root: {
    width: 'calc(100% - 10px)',
    height: 'calc(100% - 10px)',
    margin: '5px',
    // Parent background is assumed dark; this container is transparent.
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  header: {
    marginBottom: '12px',
    paddingLeft: '5px',
    fontFamily: 'Arial, sans-serif',
    color: '#fff',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    height: 'calc(100% - 40px)',
  },
  row: {
    height: '63px',
    display: 'flex',
    flexDirection: 'row',
    gap: '4px',
  },
  chartContainer: {
    flex: '1 0 auto',
    position: 'relative',
  },
  symbolHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    padding: '0 5px',
    fontFamily: 'Arial, sans-serif',
    color: '#fff',
  },
  price: {
    color: '#ccc',
    fontSize: '14px',
  },
});

// Colors chosen to be subtle and in harmony with the Dial component.
const COLORS = {
  axis: { line: '#a6a6a6', text: '#fff' },
  grid: { line: '#6d6d6d', zero: '#929292' },
  series: {
    // For the call (green) series and its fill
    call: { line: '#8bd100', area: 'rgba(139,209,0,0.4)' },
    // For the put (red) series and its fill
    put: { line: '#f25022', area: 'rgba(242,80,34,0.4)' },
  },
};

//
// ─────────────────────────────────────────────────────────────────────────────
//   INTERFACES
// ─────────────────────────────────────────────────────────────────────────────
//
interface ChartDataPoint {
  index: number;
  call: number;
  put: number;
}

interface FlowChartProps {
  expirationDate: string;
  flowData: { call: number[]; put: number[] };
  chartWidth: number;
  chartHeight: number;
}

//
// ─────────────────────────────────────────────────────────────────────────────
//   LEGEND COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
//
const Legend: React.FC<{ expirationDate: string; ratioPercent: number }> = ({
  expirationDate,
  ratioPercent,
}) => (
  <g>
    <circle
      cx={3}
      cy={7}
      r={3}
      fill={ratioPercent >= 50 ? COLORS.series.call.line : COLORS.series.put.line}
    />
    <text
      x={12}
      y={10}
      fill={COLORS.axis.text}
      style={{ fontSize: '9px', fontFamily: 'Arial, sans-serif' }}>
      {expirationDate} • {ratioPercent}% C/P
    </text>
  </g>
);

//
// ─────────────────────────────────────────────────────────────────────────────
//   FLOW CHART COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
//
const FlowChart: React.FC<FlowChartProps> = ({
  expirationDate,
  flowData,
  chartWidth,
  chartHeight,
}) => {
  // Step 1: Determine the latest call and put values.
  const lastCall = flowData.call.slice(-1)[0] || 0;
  const lastPut = flowData.put.slice(-1)[0] || 0;
  const total = lastCall + lastPut;
  const ratioPercent = total ? Math.round((lastCall / total) * 100) : 0;

  // Step 2: Compute the inner dimensions.
  const xMax = chartWidth - MARGIN.left - MARGIN.right;
  const yMax = chartHeight - MARGIN.top - MARGIN.bottom;

  // Step 3: Prepare the data points.
  const data: ChartDataPoint[] = useMemo(
    () =>
      flowData.call.map((call, i) => ({
        index: i,
        call,
        put: flowData.put[i],
      })),
    [flowData],
  );

  // Step 4: Create scales.
  const { xScale, yScale } = useMemo(() => {
    const allValues = [...flowData.call, ...flowData.put];
    const maxValue = Math.max(...allValues, 0);
    return {
      xScale: scaleLinear({ domain: [0, data.length - 1], range: [0, xMax] }),
      yScale: scaleLinear({ domain: [0, maxValue * 1.1], range: [yMax, 0] }),
    };
  }, [flowData, data.length, xMax, yMax]);

  // Step 5: Render the chart using Threshold.
  return (
    <div style={{ position: 'relative' }}>
      <svg width={chartWidth} height={chartHeight}>
        <Legend expirationDate={expirationDate} ratioPercent={ratioPercent} />
        <Group left={MARGIN.left} top={MARGIN.top}>
          <Line
            from={{ x: 0, y: yMax }}
            to={{ x: xMax, y: yMax }}
            stroke={COLORS.grid.zero}
            strokeDasharray="2,2"
          />
          <Threshold<ChartDataPoint>
            id={`thr-${expirationDate}`}
            data={data}
            x={d => xScale(d.index) ?? 0}
            // Use y0 for put values and y1 for call values.
            y0={d => yScale(d.put) ?? 0}
            y1={d => yScale(d.call) ?? 0}
            clipAboveTo={0}
            clipBelowTo={yMax}
            curve={curveBasis}
            aboveAreaProps={{
              fill: COLORS.series.put.area, // red fill when put is on top
              fillOpacity: 0.4,
            }}
            belowAreaProps={{
              fill: COLORS.series.call.area, // green fill when call is on top
              fillOpacity: 0.4,
            }}
          />
          <LinePath<ChartDataPoint>
            data={data}
            x={d => xScale(d.index) ?? 0}
            y={d => yScale(d.call) ?? 0}
            stroke={COLORS.series.call.line}
            strokeWidth={1}
            curve={curveBasis}
          />
          <LinePath<ChartDataPoint>
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
};

//
// ─────────────────────────────────────────────────────────────────────────────
//   MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
//
export const ExtrinsicValueFlows: React.FC = () => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  const { flowBySymbol } = useExtrinsicValueData();

  if (Object.keys(flowBySymbol).length === 0) {
    return (
      <div ref={parentRef} className={styles.root}>
        <div className={styles.spinnerContainer}>
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  const symbolCount = Object.keys(flowBySymbol).length;
  const rowHeight = height / symbolCount;

  return (
    <div ref={parentRef} className={styles.root}>
      <div style={{ width, height }}>
        <div className={styles.header}>
          <Text size={500}>Extrinsic Value Flows</Text>
        </div>
        <div className={styles.content}>
          {Object.entries(flowBySymbol).map(([symbol, data]) => (
            <div key={symbol} style={{ padding: '5px', flex: 1 }}>
              <div className={styles.symbolHeader}>
                <Text size={200}>{symbol}</Text>
                <span className={styles.price}>${data.lastTradePrice?.toFixed(2) ?? 'N/A'}</span>
              </div>
              <div>
                {Object.entries(data.historicalFlowTotals).map(([expDate, flow]) => (
                  <FlowChart
                    key={`${symbol}-${expDate}`}
                    expirationDate={expDate}
                    flowData={flow}
                    chartWidth={width}
                    chartHeight={Math.min(63, rowHeight / 3)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExtrinsicValueFlows;
