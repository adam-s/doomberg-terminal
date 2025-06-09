import {
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  TableCellLayout,
  Button,
  tokens,
} from '@fluentui/react-components';
import { FastAccelerationFilled } from '@fluentui/react-icons'; // new import
import { SellOrderDetails, SellTraderData } from '@src/services/trader/types';

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
  profitPositive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  profitNegative: {
    color: tokens.colorPaletteRedForeground1,
  },
  actionCell: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  sellButton: {
    minWidth: 'unset',
    height: '24px',
    padding: '0 8px',
    paddingRight: '32px', // Combine padding properties
  },
  fastSellButton: {
    position: 'absolute',
    right: '4px',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '4px',
    minWidth: 'unset',
    height: '24px',
    width: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    '&:not([disabled]):hover': {
      color: '#FF0000',
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
  },
  fastSellIcon: {
    fontSize: '14px',
    color: 'inherit',
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
  { columnKey: 'position', label: 'Position' },
  { columnKey: 'bidPrice', label: 'Bid' },
  { columnKey: 'profitLoss', label: 'P/L' },
];

interface PositionGridProps {
  positions: SellTraderData[];
}

export const PositionGrid = ({ positions }: PositionGridProps) => {
  const styles = useStyles();

  const handleSell = (item: SellTraderData, fast: boolean = false) => {
    if (item.quantity && item.id) {
      const order: SellOrderDetails = {
        id: item.id,
        quantity: item.quantity,
        type: 'sell' as const,
        ...(fast && { fast: true }),
      };
      item.createOrder?.(order);
    } else {
      console.warn('Cannot create sell order: Missing required properties', {
        quantity: item.quantity,
        id: item.id,
      });
    }
  };

  const renderCell = (columnKey: string, item: SellTraderData) => {
    switch (columnKey) {
      case 'position':
        return (
          <TableCellLayout>
            <div className={styles.twoLineCell}>
              <div className={styles.strong}>
                {item.symbol} ${item.strikePrice?.toFixed(0)}{' '}
                {item.optionType?.charAt(0).toUpperCase() +
                  (item.optionType?.slice(1).toLowerCase() ?? '')}
              </div>
              <div className={styles.secondaryText}>
                {item.expirationDate
                  ? `${String(new Date(item.expirationDate).getUTCMonth() + 1).padStart(2, '0')}/${String(
                      new Date(item.expirationDate).getUTCDate(),
                    ).padStart(2, '0')} • ${item.quantity} ${item.positionType?.toLowerCase()}`
                  : ''}
              </div>
            </div>
          </TableCellLayout>
        );
      case 'bidPrice':
        return <TableCellLayout>${item.bidPrice?.toFixed(2) ?? '-'}</TableCellLayout>;
      case 'profitLoss': {
        const profitClass =
          (item.profitLoss ?? 0) >= 0 ? styles.profitPositive : styles.profitNegative;
        return (
          <TableCellLayout className={profitClass}>
            ${item.profitLoss?.toFixed(2) ?? '-'}
          </TableCellLayout>
        );
      }
      case 'actions':
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Button
              appearance="primary"
              size="small"
              className={styles.sellButton}
              onClick={() => handleSell(item, false)}
              aria-label={`Sell ${item.symbol} position`}>
              Sell
            </Button>
            <Button
              appearance="transparent"
              size="small"
              className={styles.fastSellButton}
              onClick={e => {
                e.stopPropagation();
                handleSell(item, true);
              }}>
              <FastAccelerationFilled className={styles.fastSellIcon} />
            </Button>
          </div>
        );
      default:
        return <TableCellLayout>&nbsp;</TableCellLayout>;
    }
  };

  const renderEmptyState = () => (
    <TableRow>
      <TableCell colSpan={columns.length} className={styles.emptyCell}>
        No open positions
      </TableCell>
    </TableRow>
  );

  return (
    <div className={styles.root}>
      <Table className={styles.table} aria-label="Position details">
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
          {positions.length > 0
            ? positions.map((position, idx) => (
                <TableRow key={position.id || idx}>
                  {columns.map(column => (
                    <TableCell key={column.columnKey} className={styles.cell}>
                      {renderCell(column.columnKey, position)}
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
