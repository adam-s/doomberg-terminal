import React, { useCallback } from 'react';
import {
  makeStyles,
  Text,
  Button,
  tokens,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  TableCellLayout,
  Spinner,
  mergeClasses,
} from '@fluentui/react-components';
import { DeleteRegular } from '@fluentui/react-icons';
import { useTradingGame } from '@src/side-panel/hooks/useTradingGame';
import { Position } from '@src/services/tradingGame/position';

// Constants
const SYMBOL = 'QQQ';

const useStyles = makeStyles({
  root: {
    padding: '10px 0',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  controls: {},
  buttonContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    position: 'relative',
    marginBottom: '0.5rem',
    padding: '0 10px',
  },
  inputDropdown: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  buttonsWrapper: {
    position: 'relative',
    flex: '4 0 auto',
  },
  buyButton: {
    minWidth: 'unset',
    height: '24px',
    padding: '0 8px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    '&[disabled]': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground4,
    },
  },
  sellButton: {
    minWidth: 'unset',
    height: '24px',
    padding: '0 8px',
  },
  balanceInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 10px 8px 10px',
    fontSize: '12px',
  },
  balanceValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  profitPositive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  profitNegative: {
    color: tokens.colorPaletteRedForeground1,
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
  emptyCell: {
    padding: '2px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  tableContainer: {
    height: '100%',
    overflow: 'auto',
    borderRadius: tokens.borderRadiusSmall,
    margin: '0 10px 0 10px',
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
  spinnerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    zIndex: 10,
  },
});

export const TradingGame: React.FC = () => {
  const styles = useStyles();

  // Use the updated hook with useService internally
  const [
    { activePositions, totalProfitLoss, isLoading },
    { buyPosition, sellPosition, resetGame },
  ] = useTradingGame();

  // Add separate handlers for CALL and PUT
  const handleBuyCallClick = useCallback(() => {
    buyPosition(SYMBOL, true);
  }, [buyPosition]);

  const handleBuyPutClick = useCallback(() => {
    buyPosition(SYMBOL, false);
  }, [buyPosition]);

  const handleSellClick = useCallback(
    (positionId: string) => {
      sellPosition(positionId);
    },
    [sellPosition],
  );

  const handleResetClick = useCallback(() => {
    resetGame();
  }, [resetGame]);

  const columns = [
    { columnKey: 'symbol', label: 'Symbol' },
    { columnKey: 'optionType', label: 'Type' },
    { columnKey: 'profitLoss', label: 'P/L' },
    { columnKey: 'actions', label: '' },
  ];

  const totalPLClass = totalProfitLoss >= 0 ? styles.profitPositive : styles.profitNegative;

  return (
    <div className={styles.root}>
      {isLoading && (
        <div className={styles.spinnerOverlay}>
          <Spinner size="small" />
        </div>
      )}

      <div className={styles.balanceInfo}>
        <Text>Total P/L:</Text>
        <Text className={mergeClasses(styles.balanceValue, totalPLClass)}>
          ${totalProfitLoss.toFixed(2)}
        </Text>
      </div>

      <div className={styles.controls}>
        <div className={styles.buttonContainer}>
          <div className={styles.buttonsWrapper} style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              size="small"
              className={styles.buyButton}
              appearance="primary"
              disabled={isLoading}
              onClick={handleBuyCallClick}>
              BUY CALL
            </Button>
            <Button
              size="small"
              className={styles.buyButton}
              appearance="primary"
              disabled={isLoading}
              onClick={handleBuyPutClick}>
              BUY PUT
            </Button>
          </div>

          <Button
            size="small"
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={handleResetClick}
            disabled={isLoading}></Button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <Table className={styles.table} aria-label="Paper Trading Portfolio">
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
            {activePositions.length > 0 ? (
              activePositions.map((position: Position) => {
                const profitLoss = position.getPnL();
                const profitLossClass =
                  profitLoss >= 0 ? styles.profitPositive : styles.profitNegative;
                const optionTypeDisplay = position.isLong ? 'CALL' : 'PUT';

                return (
                  <TableRow key={position.id}>
                    <TableCell className={styles.cell}>
                      <TableCellLayout>{position.symbol}</TableCellLayout>
                    </TableCell>
                    <TableCell className={styles.cell}>
                      <TableCellLayout>{optionTypeDisplay}</TableCellLayout>
                    </TableCell>
                    <TableCell className={styles.cell}>
                      <TableCellLayout className={mergeClasses(profitLossClass)}>
                        ${profitLoss.toFixed(2)}
                      </TableCellLayout>
                    </TableCell>
                    <TableCell className={styles.cell}>
                      <Button
                        size="small"
                        appearance="primary"
                        className={styles.sellButton}
                        onClick={() => handleSellClick(position.id)}
                        disabled={isLoading}>
                        Sell
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className={styles.emptyCell}>
                  No open positions
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
