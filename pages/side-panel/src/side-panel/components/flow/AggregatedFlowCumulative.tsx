import React from 'react';
import { SymbolData } from '@src/side-panel/hooks/useExtrinsicValueFlows';
import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { useTextStyles } from '../common/textStyles';

const useClasses = makeStyles({
  container: {
    width: '100px', // Fixed width of 100px
    padding: '0 10px', // Scaled down from 13px horizontally
    fontFamily: 'Arial, sans-serif',
    border: '1px solid transparent',
    borderRadius: '5px', // Scaled down from 6px
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueContainer: {
    display: 'flex',
    alignItems: 'center', // Centering value and arrow vertically
    marginBottom: '5px', // Slightly reduced from 6px
  },
  value: {
    fontSize: '21px', // Scaled down from 26px (26 * 0.8 ≈ 21)
    fontWeight: 600,
    color: '#777',
    lineHeight: 1.2,
  },
  arrow: {
    marginTop: '-1.5px', // Scaled down from -2px
    marginLeft: '5px', // Scaled down from 6px
    fontSize: '15px', // Scaled down from 19px
    transition: 'color 0.3s ease',
  },
  sparkline: {
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
});

export const AggregatedFlowCumulative: React.FC<{
  symbolData: SymbolData;
  symbol?: string;
  width?: number;
  height?: number;
}> = ({ symbolData }) => {
  const classes = useClasses();
  const textStyles = useTextStyles();

  const cumulative = symbolData.aggregatedFlowData?.cumulative || [];

  if (cumulative.length === 0) {
    return (
      <div
        style={{
          width: '100px',
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

  return (
    <div className={classes.container}>
      <div className={mergeClasses(textStyles.labelText)}>Cumulative</div>
      <div className={classes.valueContainer}>
        <div className={classes.value}>{latest.toFixed(0)}</div>
        <div className={classes.arrow} style={{ color: arrowColor }}>
          {arrow}
        </div>
      </div>
    </div>
  );
};

export default AggregatedFlowCumulative;
