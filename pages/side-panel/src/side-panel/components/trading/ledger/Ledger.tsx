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
} from '@fluentui/react-components';
import { useClosedPositions } from '@src/side-panel/hooks/useClosedPositions';
import { ExitReason } from '@src/services/tradingGame/types';
import { formatDuration } from './utils';
import { Position } from '@src/services/tradingGame/position';

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
  emptyCell: {
    padding: '2px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 10px 8px 10px',
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  totalPnl: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
});

const columns = [
  { columnKey: 'symbol', label: 'Symbol' },
  { columnKey: 'type', label: 'Type' },
  { columnKey: 'entryPrice', label: 'Entry' },
  { columnKey: 'exitPrice', label: 'Exit' },
  { columnKey: 'pnl', label: 'P/L ($)' },
  { columnKey: 'pnlPercent', label: 'P/L (%)' },
  { columnKey: 'duration', label: 'Duration' },
  { columnKey: 'exitReason', label: 'Exit Reason' },
];

export const Ledger: React.FC = () => {
  const styles = useStyles();
  const closedPositions = useClosedPositions();

  const totalPnL = closedPositions.reduce((sum, position) => sum + position.getPnL(), 0);

  const renderCell = (columnKey: string, position: Position) => {
    switch (columnKey) {
      case 'symbol':
        return <TableCellLayout className={styles.strong}>{position.symbol}</TableCellLayout>;
      case 'type':
        return <TableCellLayout>{position.isLong ? 'CALL' : 'PUT'}</TableCellLayout>;
      case 'entryPrice':
        return <TableCellLayout>${position.entryPrice.toFixed(2)}</TableCellLayout>;
      case 'exitPrice':
        return <TableCellLayout>${position.closePrice?.toFixed(2) ?? '-'}</TableCellLayout>;
      case 'pnl': {
        const pnl = position.getPnL();
        const profitClass = pnl >= 0 ? styles.profitPositive : styles.profitNegative;
        return <TableCellLayout className={profitClass}>${pnl.toFixed(2)}</TableCellLayout>;
      }
      case 'pnlPercent': {
        const pnl = position.getPnL();
        const pnlPercent = position.getPnLPercentage();
        const profitClass = pnl >= 0 ? styles.profitPositive : styles.profitNegative;
        return (
          <TableCellLayout className={profitClass}>
            {pnlPercent !== undefined ? `${pnlPercent.toFixed(2)}%` : '-'}
          </TableCellLayout>
        );
      }
      case 'duration':
        return (
          <TableCellLayout>
            {position.durationMs ? formatDuration(position.durationMs) : '-'}
          </TableCellLayout>
        );
      case 'exitReason':
        return <TableCellLayout>{position.exitReason ?? ExitReason.NONE}</TableCellLayout>;
      default:
        return <TableCellLayout>&nbsp;</TableCellLayout>;
    }
  };

  const renderEmptyState = () => (
    <TableRow>
      <TableCell colSpan={columns.length} className={styles.emptyCell}>
        No closed positions
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.title}>Trading Ledger</h2>
        <div
          className={`${styles.totalPnl} ${totalPnL >= 0 ? styles.profitPositive : styles.profitNegative}`}>
          Total P/L: ${totalPnL.toFixed(2)}
        </div>
      </div>
      <div className={styles.root}>
        <Table className={styles.table} aria-label="Trading history">
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
            {closedPositions.length > 0
              ? closedPositions.map(position => (
                  <TableRow key={position.id}>
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
    </>
  );
};
