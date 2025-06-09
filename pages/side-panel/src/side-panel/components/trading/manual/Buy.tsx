import { useState } from 'react';
import {
  Dropdown,
  Option,
  makeStyles,
  Spinner,
  Button,
  tokens,
  type OnSelectionChangeData,
  type TableRowId,
} from '@fluentui/react-components';
import { ErrorCircleFilled, FastAccelerationFilled } from '@fluentui/react-icons';
import type { MouseEvent, KeyboardEvent } from 'react';
import { OptionGrid } from './OptionGrid';
import { SymbolType, OptionType } from '@src/services/trader/chain';
import { BuyTraderData } from '@src/services/trader/types';

const baseContainer = {
  display: 'flex',
  alignItems: 'center',
};

const useStyles = makeStyles({
  root: { padding: '10px 0', minHeight: '300px' },
  controls: {},
  table: {},
  spinnerContainer: {
    ...baseContainer,
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    ...baseContainer,
    gap: '0.5rem',
    position: 'relative',
    marginBottom: '0.5rem',
    padding: '0 10px',
  },
  buttonsWrapper: {
    position: 'relative',
    flex: '4 0 auto',
  },
  buyButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    paddingRight: '32px', // Make room for lightning button
    position: 'relative',
    '&[disabled]': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground4,
    },
  },
  lightningButton: {
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
  lightningIcon: {
    fontSize: '14px',
    color: 'inherit',
  },
  infoBox: {
    ...baseContainer,
    position: 'absolute',
    flex: '1 0 32px',
    minWidth: 'auto',
    height: '32px',
    right: '18px',
    justifyContent: 'center',
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '20px',
    display: 'block',
  },
  inputDropdown: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  dataGrid: {},
  noData: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px',
  },
});

export type ContractType = 'CALL' | 'PUT';

export interface Order {
  quantity: number;
  stock: string;
  contractType: ContractType;
}

const availableContractTypes: ContractType[] = ['CALL', 'PUT'];

interface BuyProps {
  buyData: BuyTraderData;
}

export const Buy = ({ buyData }: BuyProps) => {
  const hasError = false;
  const isBuying = false;

  const [quantity, setQuantity] = useState(1);
  const [selectedItems, setSelectedItems] = useState<Set<TableRowId>>(new Set());
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const styles = useStyles();
  const quantityOptions = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

  const {
    symbol,
    marketDataItems,
    askPrice,
    expirationDates,
    selectedExpirationDate,
    optionType,
    setSelectedExpirationDate,
    setOptionType,
    refreshChain,
    createOrder,
  } = buyData;

  const handleSelectionChange = (
    _e: MouseEvent<Element> | KeyboardEvent<Element>,
    data: OnSelectionChangeData,
  ) => {
    // Narrow the id to a string elegantly.
    const rawId = Array.from(data.selectedItems)[0];
    const refinedId = typeof rawId === 'number' ? rawId.toString() : rawId;
    console.log('Selected ID:', refinedId);
    setSelectedItems(data.selectedItems);
    setSelectedId(refinedId);
  };

  const createOrderWithDetails = (fast: boolean = false) => {
    if (selectedId) {
      createOrder?.({
        id: selectedId,
        quantity,
        contractType: optionType ?? 'CALL',
        type: 'buy',
        fast,
      });
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.buttonContainer}>
          <div className={styles.buttonsWrapper}>
            <Button
              size="small"
              className={styles.buyButton}
              appearance="primary"
              disabled={isBuying || selectedItems.size === 0}
              onClick={() => createOrderWithDetails(false)}>
              BUY
            </Button>
            <Button
              size="small"
              appearance="transparent"
              className={styles.lightningButton}
              disabled={isBuying || selectedItems.size === 0}
              onClick={e => {
                e.stopPropagation();
                createOrderWithDetails(true);
              }}>
              <FastAccelerationFilled className={styles.lightningIcon} />
            </Button>
          </div>
          <Dropdown
            size="small"
            disabled={isBuying}
            className={styles.inputDropdown}
            onOptionSelect={(_e, data) => {
              setQuantity(parseInt(data.optionText ?? '1'));
            }}
            value={quantity.toString()}
            selectedOptions={[quantity.toString()]}>
            {quantityOptions.map(option => (
              <Option key={option}>{option}</Option>
            ))}
          </Dropdown>
          <div className={styles.infoBox}>
            {hasError && (
              <span className={styles.spinnerContainer}>
                <ErrorCircleFilled className={styles.errorIcon} />
              </span>
            )}
            {isBuying && !hasError && (
              <span className={styles.spinnerContainer}>
                <Spinner size="extra-tiny" />
              </span>
            )}
          </div>
        </div>
        <div className={styles.buttonContainer}>
          <Dropdown
            size="small"
            disabled={isBuying}
            className={styles.inputDropdown}
            onOptionSelect={(_e, data) => {
              setSelectedExpirationDate?.(data.optionText ?? '');
              setSelectedItems(new Set());
              setSelectedId(undefined);
            }}
            value={selectedExpirationDate ?? (expirationDates ? expirationDates[0] : '')}
            selectedOptions={[
              selectedExpirationDate ?? (expirationDates ? expirationDates[0] : ''),
            ]}>
            {expirationDates?.slice(0, 10).map(option => <Option key={option}>{option}</Option>)}
          </Dropdown>
          <Dropdown
            size="small"
            disabled={isBuying}
            className={styles.inputDropdown}
            onOptionSelect={(_e, data) => {
              const selectedType = data.optionText ?? 'CALL';
              setOptionType?.(selectedType as OptionType);
              // Reset selection state on option type change
              setSelectedItems(new Set());
              setSelectedId(undefined);
            }}
            value={optionType ?? 'CALL'}
            selectedOptions={[optionType ?? 'CALL']}>
            {availableContractTypes.map(option => (
              <Option key={option}>{option}</Option>
            ))}
          </Dropdown>
          <Dropdown
            size="small"
            disabled={isBuying}
            className={styles.inputDropdown}
            onOptionSelect={(_e, data) => {
              const newSymbol = data.optionText as SymbolType;
              refreshChain?.(newSymbol);
              // Reset selection state on symbol change
              setSelectedItems(new Set());
              setSelectedId(undefined);
            }}
            value={symbol ?? SymbolType.QQQ}
            selectedOptions={[symbol ?? SymbolType.QQQ]}>
            {Object.values(SymbolType).map(option => (
              <Option key={option}>{option}</Option>
            ))}
          </Dropdown>
        </div>
      </div>
      <div className={styles.table}>
        {marketDataItems && askPrice && marketDataItems.length > 0 ? (
          <OptionGrid
            items={marketDataItems}
            selectedItems={selectedItems}
            onSelectionChange={handleSelectionChange}
            askPrice={askPrice}
          />
        ) : (
          <div className={styles.noData}>
            <Spinner size="extra-tiny" />
          </div>
        )}
      </div>
    </div>
  );
};
