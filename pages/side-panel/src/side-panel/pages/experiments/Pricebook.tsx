/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { makeStyles, tokens } from '@fluentui/react-components';
import React from 'react';
import { Panel } from '../components/Panel';
import PricebookChart from '../components/pricebook/PricebookChart';
import { usePricebook } from '../hooks/usePricebook';

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'grid',
    gap: '10px',
  },
  centeredText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground2,
  },
});

export const Pricebook: React.FC = () => {
  const styles = useStyles();
  const { pricebookBySymbol } = usePricebook();

  return (
    <div data-test-id="flow" className={styles.root}>
      <Panel>
        {Object.entries(pricebookBySymbol).map(([symbol, data]) => (
          // Updated prop name from historicalData to history.
          <PricebookChart key={symbol} data={data.history} symbol={symbol} />
        ))}
      </Panel>
    </div>
  );
};
