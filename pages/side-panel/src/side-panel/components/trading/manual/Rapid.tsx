import { useState } from 'react';
import {
  Dropdown,
  Option,
  makeStyles,
  Button,
  tokens,
  type TableRowId,
  Slider,
  Label,
  useId,
} from '@fluentui/react-components';
import { FastAccelerationFilled } from '@fluentui/react-icons';
import { SymbolType, OptionType } from '@src/services/trader/chain';
import { BuyTraderData } from '@src/services/trader/types';

const baseContainer = {
  display: 'flex',
  alignItems: 'center',
};

const useStyles = makeStyles({
  root: { padding: '10px 0' },
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
  // Delta slider styles
  deltaContainer: {
    padding: '0 10px',
    marginBottom: '0.5rem',
  },
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  deltaValue: {
    fontSize: '12px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground1,
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  contractButton: {
    flex: 1,
    minWidth: 0,
  },
  callButton: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    '&:hover': {
      backgroundColor: tokens.colorPaletteGreenBackground2,
    },
    '&[disabled]': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground4,
    },
  },
  putButton: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    '&:hover': {
      backgroundColor: tokens.colorPaletteRedBackground2,
    },
    '&[disabled]': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground4,
    },
  },
});

export type ContractType = 'CALL' | 'PUT';

export interface Order {
  quantity: number;
  stock: string;
  contractType: ContractType;
}

interface BuyProps {
  buyData: BuyTraderData;
}

export const Rapid = ({ buyData }: BuyProps) => {
  const isBuying = false;

  const [quantity, setQuantity] = useState(1);
  const [, setSelectedItems] = useState<Set<TableRowId>>(new Set());
  const [, setSelectedId] = useState<string | undefined>(undefined);
  const [targetDelta, setTargetDelta] = useState(0.3); // Default delta value in the middle of the range

  const sliderId = useId('delta-slider');
  const styles = useStyles();
  const quantityOptions = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

  const {
    symbol,
    marketDataItems,
    expirationDates,
    selectedExpirationDate,
    setSelectedExpirationDate,
    refreshChain,
    createOrder,
    findClosestOptionByDelta,
  } = buyData;

  // Function to select an option based on delta and create an order
  const selectAndOrderByDelta = (contractType: ContractType, fast = false) => {
    // Convert from ContractType to OptionType for the service call
    const optionContractType = contractType === 'CALL' ? OptionType.CALL : OptionType.PUT;

    // Find the option closest to our target delta
    const option = findClosestOptionByDelta?.(optionContractType, targetDelta);

    if (!option) {
      console.error(`No option found with delta close to ${targetDelta} for ${contractType}`);
      return;
    }

    // Create new Set with the selected option ID
    const newSelectedItems = new Set<TableRowId>([option.id]);

    // Update selection state
    setSelectedItems(newSelectedItems);
    setSelectedId(option.id);

    // Create the order with the selected option
    createOrder?.({
      id: option.id,
      quantity,
      contractType,
      type: 'buy',
      fast,
    });

    console.log(
      `Created ${contractType} order with delta ${option.delta} (Strike: ${option.strikePrice})`,
    );
  };

  return (
    <div className={styles.root}>
      {/* Delta slider and the new Call/Put buttons */}
      <div className={styles.deltaContainer}>
        <div className={styles.sliderContainer}>
          <Label htmlFor={sliderId} size="small">
            CALL: +{targetDelta.toFixed(2)} | PUT: -{targetDelta.toFixed(2)}
          </Label>
          <Slider
            id={sliderId}
            min={0.15}
            max={0.6}
            step={0.01}
            value={targetDelta}
            onChange={(_, data) => setTargetDelta(data.value)}
          />

          <div className={styles.buttonRow}>
            {/* CALL button with integrated fast button */}
            <div className={styles.buttonsWrapper}>
              <Button
                size="small"
                className={styles.buyButton}
                appearance="primary"
                disabled={isBuying || !marketDataItems?.length}
                onClick={() => selectAndOrderByDelta('CALL')}>
                BUY CALL
              </Button>
              <Button
                size="small"
                appearance="transparent"
                className={styles.lightningButton}
                disabled={isBuying || !marketDataItems?.length}
                onClick={e => {
                  e.stopPropagation();
                  selectAndOrderByDelta('CALL', true);
                }}>
                <FastAccelerationFilled className={styles.lightningIcon} />
              </Button>
            </div>

            {/* PUT button with integrated fast button */}
            <div className={styles.buttonsWrapper}>
              <Button
                size="small"
                className={styles.buyButton}
                appearance="primary"
                disabled={isBuying || !marketDataItems?.length}
                onClick={() => selectAndOrderByDelta('PUT')}>
                BUY PUT
              </Button>
              <Button
                size="small"
                appearance="transparent"
                className={styles.lightningButton}
                disabled={isBuying || !marketDataItems?.length}
                onClick={e => {
                  e.stopPropagation();
                  selectAndOrderByDelta('PUT', true);
                }}>
                <FastAccelerationFilled className={styles.lightningIcon} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        {/* Existing dropdowns for expirations, option type, etc. */}
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
        </div>
      </div>
    </div>
  );
};
