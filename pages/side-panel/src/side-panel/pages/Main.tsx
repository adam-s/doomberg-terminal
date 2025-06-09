import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { Panel } from '../components/Panel'; // Assuming Panel component is needed
import { Flow as FlowComponent } from '../components/flow/Flow';
import { DeltaChart } from '../components/charts/DeltaChart';
import { Trading } from '../components/trading/Trading';
import { VolatilitySkewChart } from '../components/sentiment/VolatilitySkewChart';
import { StrikeFlow } from '../components/strikeFlow/StrikeFlow';

// Define breakpoints (consider moving to a shared constants file)
const BREAKPOINTS = {
  MOBILE: '300px',
  TABLET: '600px',
  DESKTOP: '900px',
} as const;

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      gridTemplateColumns: '1fr 1fr',
    },
    [`@media (min-width: ${BREAKPOINTS.DESKTOP})`]: {
      gridTemplateColumns: '1fr 1fr 1fr',
    },
  },
  column: {
    display: 'grid',
    gap: '10px',
    minHeight: 0,
    overflow: 'hidden',
    minWidth: 0, // Add this
  },
  leftColumn: {
    gridTemplateRows: '2fr 1fr',
  },
  centerColumn: {
    display: 'none',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      display: 'grid',
      gridTemplateRows: '2fr 1fr',
    },
  },
  rightColumn: {
    display: 'none',
    [`@media (min-width: ${BREAKPOINTS.DESKTOP})`]: {
      display: 'grid',
      gridTemplateRows: '1fr',
    },
  },
  panelContent: {
    minHeight: 0,
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0, // Add this
  },
});

export const Main: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="main" className={styles.root}>
      {/* Left Column */}
      <div className={`${styles.column} ${styles.leftColumn}`}>
        <Panel className={styles.panelContent}>
          <StrikeFlow />
        </Panel>
        <Panel className={styles.panelContent}>
          <FlowComponent />
        </Panel>
      </div>
      {/* Center Column */}
      <div className={`${styles.column} ${styles.centerColumn}`}>
        <Panel className={styles.panelContent}>
          <VolatilitySkewChart />
        </Panel>
        <Panel className={styles.panelContent}>
          <DeltaChart />
        </Panel>
      </div>
      {/* Right Column */}
      <div className={`${styles.column} ${styles.rightColumn}`}>
        <Panel className={styles.panelContent}>
          <Trading />
        </Panel>
      </div>
    </div>
  );
};
