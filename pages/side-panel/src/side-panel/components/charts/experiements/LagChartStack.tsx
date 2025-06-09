import { makeStyles } from '@fluentui/react-components';
import React from 'react';
import { LagChart } from './LagChart';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    height: '100%',
    minHeight: 0,
  },
  chartItem: {
    flex: 1,
    minHeight: 0,
  },
  containerWrapper: {
    position: 'relative',
    height: '100%',
  },
});

export const LagChartStack: React.FC = () => {
  const styles = useStyles();

  return (
    <div className={styles.containerWrapper}>
      <div className={styles.container}>
        <div className={styles.chartItem}>
          <LagChart lag={2} dataPoints={10} />
        </div>
        <div className={styles.chartItem}>
          <LagChart lag={30} dataPoints={10} />
        </div>
      </div>
    </div>
  );
};
