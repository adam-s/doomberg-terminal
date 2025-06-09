/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { Trading as TradingComponent } from '../components/trading/Trading';

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'flex',
    flexDirection: 'column',
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

export const Trading: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="trading" className={styles.root}>
      <Panel>
        <TradingComponent />
      </Panel>
    </div>
  );
};
