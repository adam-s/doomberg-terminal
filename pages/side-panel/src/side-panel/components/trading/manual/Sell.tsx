import { makeStyles } from '@fluentui/react-components';
import { PositionGrid } from './PositionGrid';
import { SellTraderData } from '@src/services/trader/types';

const useStyles = makeStyles({
  root: { padding: '10px 0' },
});

interface SellProps {
  sellData: SellTraderData[];
}

export const Sell = ({ sellData }: SellProps) => {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <PositionGrid positions={sellData} />
    </div>
  );
};
