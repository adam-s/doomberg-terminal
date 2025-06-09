import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { NewsMain } from '../components/news/NewsMain';
import { Panel } from '../components/Panel';
import { Calendar } from '../components/news/Calendar';

// Define breakpoints
const BREAKPOINTS = {
  TABLET: '600px',
  // DESKTOP: '900px', // Removed DESKTOP breakpoint
} as const;

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr', // Default to 1 column
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      gridTemplateColumns: '1fr 1fr', // 2 columns for tablet and wider
    },
    // Removed DESKTOP media query for 3 columns
  },
  column: {
    display: 'grid', // Changed from flex to grid to match Main.tsx
    gap: '10px',
    minHeight: 0,
    overflow: 'hidden',
    minWidth: 0,
  },
  leftColumn: {
    // Styles for the left column, initially visible
    gridTemplateRows: '1fr', // Example: single row
  },
  centerColumn: {
    display: 'none', // Hidden by default
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      display: 'grid', // Becomes visible on tablet and wider
      gridTemplateRows: '1fr', // Example: single row
    },
  },
  /* Removed rightColumn style definition
  rightColumn: {
    display: 'none', // Hidden by default
    [`@media (min-width: ${BREAKPOINTS.DESKTOP})`]: {
      display: 'grid', // Becomes visible on desktop
      gridTemplateRows: '1fr', // Example: single row
    },
  },
  */
  panelContent: {
    minHeight: 0,
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
});

const News: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="news-page" className={styles.root}>
      {/* Left Column */}
      <div className={`${styles.column} ${styles.leftColumn}`}>
        <Panel className={styles.panelContent}>
          <NewsMain />
        </Panel>
      </div>
      {/* Center Column */}
      <div className={`${styles.column} ${styles.centerColumn}`}>
        <Panel className={styles.panelContent}>
          <Calendar />
        </Panel>
      </div>
      {/* Right Column - REMOVED */}
    </div>
  );
};

export { News };
