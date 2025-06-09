import {
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridBody,
  DataGridCell,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition,
  mergeClasses,
  Button,
  DataGridHeaderCell,
} from '@fluentui/react-components';
import type { SellTraderData } from '@src/side-panel/hooks/useTrader';

const useStyles = makeStyles({
  grid: {
    height: '100%',
    overflow: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    margin: '0 0 0 10px',
    // Customize scrollbar for Webkit browsers
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
    // Firefox scrollbar styling
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralForeground3} ${tokens.colorNeutralBackground3}`,
    '& table': {
      width: 'auto', // Allow table to size based on content
      tableLayout: 'auto', // Enable automatic column sizing
    },
  },
  headerCell: {
    flex: '1 1 auto',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cell: {
    padding: '2px 8px', // Reduced vertical padding for even more compact rows
    fontSize: '12px',
    whiteSpace: 'nowrap', // Prevent text wrapping
  },
  row: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, // Add subtle line between rows
  },
  profitBase: {
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  profitPositive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  profitNegative: {
    color: tokens.colorPaletteRedForeground1,
  },
  strong: {
    fontWeight: tokens.fontWeightSemibold,
  },
  twoLineCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0px',
    lineHeight: '14px',
    width: '100%',
  },
  secondaryText: {
    color: tokens.colorNeutralForeground2,
    fontSize: '11px',
    lineHeight: '13px',
  },
  actionCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '2px 8px',
  },
  sellButton: {
    minWidth: 'unset',
    height: '24px',
    padding: '0 8px',
  },
});

interface PositionGridProps {
  position: SellTraderData;
}

export const PositionGrid = ({ position }: PositionGridProps) => {
  const styles = useStyles();

  const handleSell = (item: SellTraderData) => {
    item.createOrder?.({
      id: item.id ?? '',
      quantity: item.quantity ?? 0,
      type: 'sell',
    });
  };

  const columns: TableColumnDefinition<SellTraderData>[] = [
    createTableColumn<SellTraderData>({
      columnId: 'symbolStrike',
      renderHeaderCell: () => (
        <DataGridHeaderCell className={styles.headerCell}>Position</DataGridHeaderCell>
      ),
      renderCell: item => (
        <DataGridCell>
          <div className={mergeClasses(styles.cell, styles.strong, styles.twoLineCell)}>
            <div>
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
        </DataGridCell>
      ),
    }),
    createTableColumn<SellTraderData>({
      columnId: 'bidPrice',
      renderHeaderCell: () => (
        <DataGridHeaderCell className={styles.headerCell}>Bid</DataGridHeaderCell>
      ),
      renderCell: item => (
        <DataGridCell className={styles.cell}>${item.bidPrice?.toFixed(2)}</DataGridCell>
      ),
    }),
    createTableColumn<SellTraderData>({
      columnId: 'profitLoss',
      renderHeaderCell: () => (
        <DataGridHeaderCell className={styles.headerCell}>P/L</DataGridHeaderCell>
      ),
      renderCell: item => {
        const profitClass =
          parseFloat(item.profitLoss?.toString() || '0') >= 0
            ? styles.profitPositive
            : styles.profitNegative;
        return (
          <DataGridCell className={mergeClasses(styles.cell, profitClass)}>
            ${item.profitLoss?.toFixed(2)}
          </DataGridCell>
        );
      },
    }),
    createTableColumn<SellTraderData>({
      columnId: 'actions',
      renderHeaderCell: () => (
        <DataGridHeaderCell className={styles.headerCell}></DataGridHeaderCell>
      ),
      renderCell: item => (
        <DataGridCell className={styles.actionCell}>
          <Button
            appearance="primary"
            size="small"
            className={styles.sellButton}
            onClick={() => handleSell(item)}
            aria-label={`Sell ${item.symbol} position`}>
            Sell
          </Button>
        </DataGridCell>
      ),
    }),
  ];

  return (
    <div className={styles.grid}>
      <DataGrid
        items={[position]}
        columns={columns}
        size="small"
        aria-label="Position details"
        getRowId={item => item.id ?? ''}>
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <div className={styles.headerCell}>{renderHeaderCell()}</div>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<SellTraderData>>
          {({ item }) => (
            <DataGridRow<SellTraderData> className={styles.row}>
              {({ renderCell }) => renderCell(item)}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
};
