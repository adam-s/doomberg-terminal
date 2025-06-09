import { makeStyles } from '@fluentui/react-components';
import type { OrdersData } from '@src/side-panel/hooks/useTrader';
import { OrdersGrid } from './OrdersGrid';

const useStyles = makeStyles({
  root: { padding: '10px 0' },
});

interface OrdersProps {
  ordersData: OrdersData;
}

export const Orders = ({ ordersData }: OrdersProps) => {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <OrdersGrid orders={ordersData.pendingOrders} />
    </div>
  );
};
