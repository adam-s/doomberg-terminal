import { IOrderSummary, ITraderService } from '@src/services/trader/trader.service';
import {
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  TableCellLayout,
  tokens,
  mergeClasses,
  Tooltip,
  Button,
} from '@fluentui/react-components';
import { useService } from '@src/side-panel/hooks/useService';
import {
  Clock24Regular,
  CheckmarkCircle24Regular,
  ArrowCircleRight24Regular,
  ErrorCircle24Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    height: '100%',
    overflow: 'scroll',
    borderRadius: tokens.borderRadiusSmall,
    margin: '0 0 0 10px',
    '&::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: tokens.colorNeutralBackground3,
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: tokens.colorNeutralForeground3,
      borderRadius: '4px',
      '&:hover': {
        background: tokens.colorNeutralForeground2,
      },
    },
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralForeground3} ${tokens.colorNeutralBackground3}`,
  },
  table: {
    width: '100%',
    tableLayout: 'auto',
  },
  headerCell: {
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap',
  },
  cell: {
    padding: '2px 8px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  twoLineCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
    lineHeight: '14px',
    alignItems: 'flex-start',
  },
  secondaryText: {
    color: tokens.colorNeutralForeground2,
    fontSize: '11px',
    lineHeight: '13px',
  },
  strong: {
    fontWeight: tokens.fontWeightSemibold,
  },
  stateIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    '& svg': {
      fontSize: '16px',
    },
  },
  processingIcon: {
    color: tokens.colorNeutralForeground3,
  },
  awaitingIcon: {
    color: tokens.colorBrandForeground1,
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
  },
  doneIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
  cancelledIcon: {
    color: tokens.colorNeutralForeground4,
  },
  cancelButton: {
    minWidth: 'unset',
    height: '20px',
    padding: '0 6px',
    borderRadius: '4px',
    fontSize: '11px',
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    '&:hover': {
      backgroundColor: tokens.colorPaletteRedBackground2,
      color: tokens.colorPaletteRedForeground1,
    },
  },
  emptyCell: {
    padding: '2px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
});

const columns = [
  { columnKey: 'actions', label: '' },
  { columnKey: 'contract', label: 'Contract' },
  { columnKey: 'details', label: 'Details' },
  { columnKey: 'price', label: 'Price' },
];

interface OrdersGridProps {
  orders: IOrderSummary[];
}

const getStateDisplay = (state: string, styles: Record<string, string>) => {
  const stateMap: Record<string, { icon: JSX.Element; tooltip: string }> = {
    PENDING: {
      icon: <Clock24Regular className={styles.processingIcon} />,
      tooltip: 'Order pending',
    },
    PROCESSING: {
      icon: <ArrowCircleRight24Regular className={styles.processingIcon} />,
      tooltip: 'Processing order',
    },
    AWAITING_FULFILLMENT: {
      icon: <Clock24Regular className={styles.awaitingIcon} />,
      tooltip: 'Awaiting fulfillment',
    },
    ERROR: {
      icon: <ErrorCircle24Regular className={styles.errorIcon} />,
      tooltip: 'Error processing order',
    },
    DONE: {
      icon: <CheckmarkCircle24Regular className={styles.doneIcon} />,
      tooltip: 'Order completed',
    },
    CANCELLED: {
      icon: <Dismiss24Regular className={styles.cancelledIcon} />,
      tooltip: 'Order cancelled',
    },
    CANCELLING: {
      icon: <Clock24Regular className={styles.cancelledIcon} />,
      tooltip: 'Cancelling order',
    },
  };

  return stateMap[state] || { icon: <Clock24Regular />, tooltip: state };
};

const renderCell = (
  columnKey: string,
  order: IOrderSummary,
  styles: Record<string, string>,
  onCancel: (id: string) => void,
) => {
  switch (columnKey) {
    case 'actions':
      return order.state !== 'CANCELLED' && order.state !== 'DONE' ? (
        <Button
          size="small"
          appearance="subtle"
          className={styles.cancelButton}
          onClick={() => onCancel(order.id)}
          disabled={order.state === 'CANCELLING'}
          aria-label={`Cancel order for ${order.symbol}`}>
          Cancel
        </Button>
      ) : null;
    case 'contract':
      return (
        <TableCellLayout className={mergeClasses(styles.strong, styles.twoLineCell)}>
          <div>
            {order.symbol} ${order.strikePrice} {order.optionType}
          </div>
          <div className={styles.secondaryText}>
            {order.expirationDate} • {order.quantity} {order.actionText}
          </div>
        </TableCellLayout>
      );
    case 'details': {
      const { icon, tooltip } = getStateDisplay(order.state, styles);
      return (
        <TableCellLayout>
          <Tooltip content={tooltip} relationship="label">
            <span className={styles.stateIcon}>{icon}</span>
          </Tooltip>
        </TableCellLayout>
      );
    }
    case 'price':
      return (
        <TableCellLayout>
          ${order.priceValue} {order.priceType}
        </TableCellLayout>
      );
    default:
      return <TableCellLayout>&nbsp;</TableCellLayout>;
  }
};

export const OrdersGrid = ({ orders }: OrdersGridProps) => {
  const styles = useStyles();
  const traderService = useService(ITraderService);

  const handleCancel = async (orderId: string) => {
    try {
      await traderService.cancelOrder(orderId);
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  const renderEmptyState = () => (
    <TableRow>
      <TableCell colSpan={columns.length} className={styles.emptyCell}>
        No pending orders
      </TableCell>
    </TableRow>
  );

  return (
    <div className={styles.root}>
      <Table className={styles.table} aria-label="Pending orders">
        <TableHeader>
          <TableRow>
            {columns.map(column => (
              <TableHeaderCell key={column.columnKey} className={styles.headerCell}>
                {column.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length > 0
            ? orders.map(order => (
                <TableRow key={order.id}>
                  {columns.map(column => (
                    <TableCell key={column.columnKey} className={styles.cell}>
                      {renderCell(column.columnKey, order, styles, handleCancel)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : renderEmptyState()}
        </TableBody>
      </Table>
    </div>
  );
};
