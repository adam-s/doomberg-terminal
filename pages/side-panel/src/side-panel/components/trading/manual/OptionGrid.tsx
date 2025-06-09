import { useMemo, useEffect, useRef, type MouseEvent, type KeyboardEvent } from 'react';
import {
  DataGrid,
  DataGridBody,
  DataGridRow,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridCell,
  type TableColumnDefinition,
  createTableColumn,
  makeStyles,
  type OnSelectionChangeData,
  type TableRowId,
  tokens,
} from '@fluentui/react-components';
import { IMarketDataItem } from '@src/services/trader/chain';

const useStyles = makeStyles({
  dataGrid: {
    height: '200px',
    flex: '1 1 100%',
    overflow: 'auto',
    position: 'relative',
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
  },
  header: {
    position: 'sticky',
    top: 0,
    backgroundColor: tokens.colorNeutralBackground2, // Slightly darker background for contrast
    zIndex: 1,
    boxShadow: `0 2px 4px ${tokens.colorNeutralShadowAmbient}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, // Add border for better separation
  },
  cell: {
    padding: '2px 8px', // Reduced vertical padding for even more compact rows
    fontSize: '12px',
    whiteSpace: 'nowrap', // Prevent text wrapping
  },
  headerCell: {
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
  },
  row: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, // Add subtle line between rows
  },
  askPriceBorder: {
    borderBottom: `2px solid ${tokens.colorBrandStroke1}`,
  },
});

interface OptionGridProps {
  items: IMarketDataItem[];
  selectedItems: Set<TableRowId>;
  askPrice: number;
  onSelectionChange: (
    e: MouseEvent<Element> | KeyboardEvent<Element>,
    data: OnSelectionChangeData,
  ) => void;
}

export const OptionGrid = ({
  items,
  selectedItems,
  onSelectionChange,
  askPrice,
}: OptionGridProps) => {
  const styles = useStyles();
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gridRef.current) {
      const boundaryRow = gridRef.current.querySelector(
        '[data-boundary="true"]',
      ) as HTMLElement | null;
      if (boundaryRow) {
        boundaryRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, []);

  const columns: TableColumnDefinition<IMarketDataItem>[] = useMemo(
    () => [
      createTableColumn<IMarketDataItem>({
        columnId: 'strikePrice',
        renderHeaderCell: () => (
          <DataGridHeaderCell className={styles.headerCell}>Strike</DataGridHeaderCell>
        ),
        renderCell: item => (
          <DataGridCell className={styles.cell}>
            ${parseFloat(item.strikePrice).toFixed(0)}
          </DataGridCell>
        ),
      }),
      createTableColumn<IMarketDataItem>({
        columnId: 'askPrice',
        renderHeaderCell: () => (
          <DataGridHeaderCell className={styles.headerCell}>Ask</DataGridHeaderCell>
        ),
        renderCell: item => (
          <DataGridCell className={styles.cell}>
            ${parseFloat(item.askPrice).toFixed(2)}
          </DataGridCell>
        ),
      }),
      createTableColumn<IMarketDataItem>({
        columnId: 'delta',
        renderHeaderCell: () => (
          <DataGridHeaderCell className={styles.headerCell}>Δ</DataGridHeaderCell>
        ),
        renderCell: item => (
          <DataGridCell className={styles.cell}>{parseFloat(item.delta).toFixed(4)}</DataGridCell>
        ),
      }),
      createTableColumn<IMarketDataItem>({
        columnId: 'impliedVolatility',
        renderHeaderCell: () => (
          <DataGridHeaderCell className={styles.headerCell}>IV</DataGridHeaderCell>
        ),
        renderCell: item => (
          <DataGridCell className={styles.cell}>
            {parseFloat(item.impliedVolatility).toFixed(4)}
          </DataGridCell>
        ),
      }),
    ],
    [styles],
  );

  // New row click handler that toggles selection
  const handleRowClick = (e: MouseEvent<Element>, rowId: TableRowId) => {
    const toggledSelection = selectedItems.has(rowId)
      ? new Set<TableRowId>()
      : new Set<TableRowId>([rowId]);
    onSelectionChange(e, { selectedItems: toggledSelection });
  };

  return (
    <DataGrid
      ref={gridRef}
      size="small"
      items={items}
      columns={columns}
      getRowId={item => item.id}
      className={styles.dataGrid}
      selectionMode="single"
      selectedItems={selectedItems}>
      <DataGridHeader className={styles.header}>
        <DataGridRow>
          {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<IMarketDataItem>>
        {({ item, rowId }) => {
          const currentStrike = parseFloat(item.strikePrice);
          const nextItem = items[items.findIndex(i => i.id === item.id) + 1];
          const nextStrike = nextItem ? parseFloat(nextItem.strikePrice) : 0;

          const isAskPriceBoundary = currentStrike >= askPrice && nextStrike < askPrice;

          return (
            <DataGridRow<IMarketDataItem>
              key={rowId}
              onClick={(e: MouseEvent<Element>) => handleRowClick(e, rowId)}
              className={isAskPriceBoundary ? styles.askPriceBorder : styles.row}
              {...(isAskPriceBoundary ? { 'data-boundary': 'true' } : {})}>
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          );
        }}
      </DataGridBody>
    </DataGrid>
  );
};
