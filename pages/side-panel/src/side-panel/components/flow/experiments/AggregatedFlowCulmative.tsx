import React from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { curveBasis } from '@visx/curve';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';
import { makeStyles } from '@fluentui/react-components';

const useClasses = makeStyles({
  container: {
    padding: '16px',
    fontFamily: 'Arial, sans-serif',
    border: '1px solid transparent',
    borderRadius: '8px',
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: '10px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#777',
    marginBottom: '4px',
  },
  valueContainer: {
    display: 'flex',
    alignItems: 'center', // Centering the value and arrow vertically
    marginBottom: '8px',
  },
  value: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#777',
    lineHeight: 1.2,
  },
  arrow: {
    marginTop: '-3px',
    marginLeft: '8px',
    fontSize: '24px',
    transition: 'color 0.3s ease',
  },
  sparkline: {
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
});

export const AggregatedFlowCumulative: React.FC<{
  symbol?: string;
  width?: number;
  height?: number;
}> = ({ symbol = 'QQQ', width = 300, height = 125 }) => {
  const classes = useClasses();
  const { flowBySymbol } = useExtrinsicValueData();
  const aggregated = flowBySymbol?.[symbol]?.aggregatedFlowData;
  const cumulative = aggregated?.cumulative || [];

  if (cumulative.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial, sans-serif',
          color: '#777',
        }}>
        No cumulative data available.
      </div>
    );
  }

  // Determine the latest cumulative value and its change.
  const latest = cumulative[cumulative.length - 1];
  const previous = cumulative.length > 1 ? cumulative[cumulative.length - 2] : latest;
  const diff = latest - previous;
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  const arrowColor = diff > 0 ? '#8bd100' : diff < 0 ? '#f25022' : '#555';

  // Calculate the available width (minus padding), then take half of it for the sparkline.
  const availableWidth = width - 32; // subtracting horizontal padding
  const sparkWidth = availableWidth / 2; // sparkline is half the available width
  const sparkHeight = 16; // slim sparkline height

  const minVal = Math.min(...cumulative);
  const maxVal = Math.max(...cumulative);
  // If min and max are equal, create a small range for the y-axis.
  const yDomain = minVal === maxVal ? [minVal - 1, maxVal + 1] : [minVal, maxVal];

  const xScale = scaleLinear<number>({
    domain: [0, cumulative.length - 1],
    range: [0, sparkWidth],
  });
  const yScale = scaleLinear<number>({
    domain: yDomain,
    range: [sparkHeight, 0],
  });
  const sparkData = cumulative.map((val, i) => ({ index: i, value: val }));

  return (
    <div className={classes.container} style={{ width, height }}>
      <div className={classes.label}>Cumulative Flow</div>
      <div className={classes.valueContainer}>
        <div className={classes.value}>{latest.toFixed(0)}</div>
        <div className={classes.arrow} style={{ color: arrowColor }}>
          {arrow}
        </div>
      </div>
      <svg width={sparkWidth} height={sparkHeight} className={classes.sparkline}>
        <Group>
          <LinePath<{ index: number; value: number }>
            data={sparkData}
            x={d => xScale(d.index)}
            y={d => yScale(d.value)}
            stroke={arrowColor}
            strokeWidth={1}
            curve={curveBasis}
          />
        </Group>
      </svg>
    </div>
  );
};

export default AggregatedFlowCumulative;
