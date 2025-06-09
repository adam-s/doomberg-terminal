import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { SymbolData } from '@src/side-panel/hooks/useExtrinsicValueFlows';
import { HistoricalFlowTotals } from '@src/services/extrinsicValue/extrinsicValueUtils';

interface FlowCumulativeProps {
  symbolData: SymbolData;
  symbol?: string;
  expDate?: string;
  flow?: HistoricalFlowTotals[string];
}

const useStyles = makeStyles({
  container: {
    fontFamily: 'Arial, sans-serif',
    border: '1px solid transparent',
    borderRadius: '6px',
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0 13px',
    minWidth: '100px',
  },
  item: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontSize: '12px',
    color: '#777',
  },
  value: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#777',
    textAlign: 'right',
    minWidth: '30px', // Ensures consistent width for numbers
    fontVariantNumeric: 'tabular-nums', // Monospaced digits
  },
  valueContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: '50px', // Adjusted to fit arrow + value
  },
  arrow: {
    fontSize: '15px', // Bolder and larger arrow
    fontWeight: 700,
    marginRight: '4px', // Space between arrow and value
    lineHeight: '15px',
    minWidth: '12px',
    textAlign: 'center',
    transition: 'color 0.3s ease',
  },
});

interface ValueAndDiff {
  latest: number;
  diff: number;
  arrow: string;
  color: string;
}

const getArrowDetails = (diff: number): { arrow: string; color: string } => {
  if (diff > 0) return { arrow: '▲', color: '#8bd100' };
  if (diff < 0) return { arrow: '▼', color: '#f25022' };
  return { arrow: '→', color: '#555' };
};

const getLatestValueAndDiff = (series?: number[]): ValueAndDiff => {
  if (!series || series.length === 0) {
    return { latest: 0, diff: 0, ...getArrowDetails(0) };
  }
  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : latest;
  const diff = latest - previous;
  return { latest, diff, ...getArrowDetails(diff) };
};

export const FlowCumulative: React.FC<FlowCumulativeProps> = ({ symbolData, flow }) => {
  const classes = useStyles();

  // Use aggregated data if no specific flow is provided.
  const data = flow
    ? {
        cumulative: flow.cumulative || [],
        cumulative5: flow.cumulative5 || [],
        cumulative8: flow.cumulative8 || [],
      }
    : symbolData.aggregatedFlowData;

  const values = {
    cumulative5: getLatestValueAndDiff(data?.cumulative5),
    cumulative8: getLatestValueAndDiff(data?.cumulative8),
    cumulative: getLatestValueAndDiff(data?.cumulative),
  };

  return (
    <div className={classes.container}>
      <div className={classes.item}>
        <div className={classes.label}>5</div>
        <div className={classes.valueContainer}>
          <div className={classes.arrow} style={{ color: values.cumulative5.color }}>
            {values.cumulative5.arrow}
          </div>{' '}
          <div className={classes.value}>{values.cumulative5.latest.toFixed(0)}</div>
        </div>
      </div>
      <div className={classes.item}>
        <div className={classes.label}>8</div>
        <div className={classes.valueContainer}>
          <div className={classes.value}>{values.cumulative8.latest.toFixed(0)}</div>
        </div>
      </div>
      <div className={classes.item}>
        <div className={classes.label}>ALL</div>
        <div className={classes.valueContainer}>
          <div className={classes.value}>{values.cumulative.latest.toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
};

export default FlowCumulative;
