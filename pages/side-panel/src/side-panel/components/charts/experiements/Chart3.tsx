import React from 'react';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
  },
});

export const Chart: React.FC = () => {
  const styles = useStyles();

  return <div className={styles.root}></div>;
};
