import React, { useState } from 'react';
import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { AggregatedFlowCumulative } from './AggregatedFlowCumulative';
import { AggregatedFlowThreshold } from './AggregatedFlowThreshold';
import { FlowThreshold } from './FlowThreshold';
import FlowCumulative from './FlowCumulative';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';
import { useTextStyles } from '../common/textStyles';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    height: '100%',
  },
  symbol: {},
  aggregated: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
  },
  thresholdContainer: {
    width: '100%',
    height: '65px', // Reduced from 75px
    flex: '1 1 auto',
  },
  cumulativeContainer: {
    flex: '1 0 auto',
  },
  symbolText: {
    fontSize: '12px',
    padding: '4px 8px', // Reduced vertical padding from 8px
    color: '#777',
  },
  emptyText: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: '#6b6b6b',
    height: '100%',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '12px',
    color: '#777',
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: '28px', // Match StrikeFlow header height
  },
  toggleText: {
    cursor: 'pointer',
    fontSize: '12px',
  },
});

const SYMBOL_OPTIONS = ['SPY', 'QQQ'];

export const Flow: React.FC = () => {
  const styles = useStyles();
  const textStyles = useTextStyles();
  const extrinsicValueData = useExtrinsicValueData();

  const [symbol, setSymbol] = useState<string>('QQQ');
  const flowBySymbol = extrinsicValueData.flowBySymbol || {};

  return (
    <div className={styles.root}>
      {Object.keys(flowBySymbol).length === 0 ? (
        <div className={styles.emptyText}>No extrinsic data available.</div>
      ) : (
        Object.entries(flowBySymbol)
          .filter(([s]) => s === symbol)
          .map(([s, symbolData]) => (
            <div key={s} className={styles.symbol}>
              <div className={styles.chartHeader}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <span className={mergeClasses(textStyles.symbolText)}>{s}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  {SYMBOL_OPTIONS.map(option => (
                    <button
                      key={option}
                      type="button"
                      className={styles.toggleText}
                      style={{
                        color: symbol === option ? '#fff' : '#777',
                        background: 'none',
                        border: 'none',
                        padding: '0 4px',
                        font: 'inherit',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: 3,
                        outline: 'none',
                      }}
                      aria-pressed={symbol === option}
                      tabIndex={0}
                      onClick={() => setSymbol(option)}>
                      [{option.toLowerCase()}]
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
              </div>
              <div className={styles.aggregated}>
                <div className={styles.thresholdContainer}>
                  <AggregatedFlowThreshold symbolData={symbolData} symbol={s} />
                </div>
                <div className={styles.cumulativeContainer}>
                  <AggregatedFlowCumulative symbolData={symbolData} symbol={s} />
                </div>
              </div>
              {symbolData.historicalFlowTotals &&
                Object.entries(symbolData.historicalFlowTotals).map(([expDate, flow]) => (
                  <div key={expDate} className={styles.aggregated}>
                    <div className={styles.thresholdContainer}>
                      <FlowThreshold expDate={expDate} flow={flow} symbol={s} />
                    </div>
                    <div className={styles.cumulativeContainer}>
                      <FlowCumulative
                        symbolData={symbolData}
                        flow={flow}
                        expDate={expDate}
                        symbol={s}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ))
      )}
    </div>
  );
};
