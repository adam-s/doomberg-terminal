/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { makeStyles, tokens } from '@fluentui/react-components';
import React from 'react';
import { Panel } from '../components/Panel';
import { OpenInterestChart } from '../components/charts/OpenInterestChart';

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

export const OpenInterest: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="open-interest" className={styles.root}>
      <Panel>
        <OpenInterestChart />
      </Panel>
    </div>
  );
};
