import React from 'react';
import { ScrollablePanel } from '../components/Panel';
import { makeStyles } from '@fluentui/react-components';
import { Simulators } from '../components/tradeSimulator/Simulations';
import { PanelId } from '../hooks/simulation/useSimulationSummary';

const BREAKPOINTS = {
  TABLET: '680px',
} as const;

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr',
    height: '100%',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  panel: {
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  secondPanel: {
    display: 'none',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      display: 'block',
    },
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
});

export const TradeSimulator: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="trade-simulator" className={styles.root}>
      {/* First panel: always visible */}
      <div className={styles.panel}>
        <ScrollablePanel>
          <Simulators panelId={PanelId.Left} />
        </ScrollablePanel>
      </div>
      {/* Second panel: only visible on wide screens */}
      <div className={styles.secondPanel}>
        <ScrollablePanel>
          <Simulators panelId={PanelId.Right} />
        </ScrollablePanel>
      </div>
    </div>
  );
};
