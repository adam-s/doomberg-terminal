import { makeStyles, Slider } from '@fluentui/react-components';
import React, { useState } from 'react';
import { LagChartWithStock } from './LagChartWithStock';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'row', // Changed from column to row
    height: '100%',
    gap: '8px',
    padding: '8px',
  },
  controls: {
    display: 'flex',
    flexDirection: 'row',
    gap: '16px',
    padding: '8px 0',
  },
  chartContainer: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
});

export const InteractiveLagChart: React.FC = () => {
  const styles = useStyles();
  const [lag, setLag] = useState(60);
  const [dataPoints, setDataPoints] = useState(100);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <Slider
          min={5}
          max={100}
          value={lag}
          onChange={(_, data) => setLag(data.value)}
          title="Lag"
          vertical={true}
          size="small"
        />
        <Slider
          min={20}
          max={200}
          value={dataPoints}
          onChange={(_, data) => setDataPoints(data.value)}
          title="Data Points"
          vertical={true}
          size="small"
        />
      </div>
      <div className={styles.chartContainer}>
        <LagChartWithStock lag={lag} dataPoints={dataPoints} />
      </div>
    </div>
  );
};
