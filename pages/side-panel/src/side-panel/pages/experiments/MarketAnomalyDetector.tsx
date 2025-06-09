/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { makeStyles, tokens } from '@fluentui/react-components';
import React from 'react';
import { Panel } from '../components/Panel';
import { ExtrinsicValueFlows } from '../components/charts/ExtrinsicValueFlows';

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
  },
  centeredText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground2,
  },
});

export const MarketAnomalyDetector: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="market-anomaly-detector" className={styles.root}>
      <Panel>
        <ExtrinsicValueFlows />
      </Panel>
    </div>
  );
};
