/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { makeStyles, tokens } from '@fluentui/react-components';
import React from 'react';
import { Chart } from '../components/charts/Chart';
import { ChartContainerBottom } from '../components/charts/ChartContainerBottom';
import { Buyx } from '../components/trading/experiments/Buyx';
import { Sellx } from '../components/trading/experiments/Sellx';
import { Panel, ScrollablePanel } from '../components/Panel';

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '3fr 5fr 100px 178px',
  },
  centeredText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground2,
  },
});

export const Home: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="home" className={styles.root}>
      <Panel>
        <Chart />
      </Panel>
      <Panel>
        <ChartContainerBottom />
      </Panel>
      <Panel>
        <Buyx />
      </Panel>
      <ScrollablePanel>
        <Sellx />
      </ScrollablePanel>
    </div>
  );
};
