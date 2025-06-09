import React, { useCallback, useEffect, useState } from 'react';
import {
  makeStyles,
  Toolbar,
  Button,
  Dropdown,
  Option,
  tokens,
  mergeClasses,
  Spinner,
} from '@fluentui/react-components';
import { IRequestService } from '@shared/services/request.service';
import { useActor, useSelector } from '@xstate/react';
import { ISidePanelMachineService } from '@src/services/sidePanelMachine.service';
import { ErrorCircleFilled } from '@fluentui/react-icons';
import {
  PositionOutput,
  useAggregatedPositions,
} from '@src/side-panel/hooks/useAggregatedPositions';
import { useService } from '@src/side-panel/hooks/useService';
import { sellFastMachine } from '@src/side-panel/machines/trading/sellFast.machine';

const useStyles = makeStyles({
  root: {
    padding: '5px 0',
  },
  positionContainer: {
    marginBottom: '8px',
    width: '100%',
  },
  toolbar: {
    display: 'grid',
    // Update grid template to have consistent button placement
    gridTemplateColumns: '1fr 60px 70px',
    gap: '10px',
    alignItems: 'center',
    width: 'calc(100% - 18px)',
  },
  // Add placeholder style for empty grid cell
  emptyCell: {
    width: '60px', // Same as dropdown width
  },
  positionInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0, // Prevents flex items from expanding beyond container
  },
  positionInfoTop: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  positionInfoBottom: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  text: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  quantityDropdown: {
    width: '60px',
    minWidth: '60px',
  },
  buttonContainer: {
    position: 'relative',
    minWidth: '70px',
  },
  sellButton: {
    width: '100%',
    minWidth: '70px',
  },
  infoBox: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '20px',
  },
  cancelButton: {
    width: '100%',
    minWidth: '70px',
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorNeutralForeground1,
    border: tokens.colorPaletteRedBackground2,
    height: '32px',
    ':hover': {
      backgroundColor: tokens.colorPaletteRedBackground1,
    },
  },
});

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

interface PositionRowProps {
  position: PositionOutput;
  requestService: IRequestService;
  activeTab: chrome.tabs.Tab;
  disabled: boolean;
  onSellingStateChange: (isSelling: boolean) => void;
  refreshOptionsOrders: () => Promise<void>;
}

export const PositionRow = ({
  position,
  requestService,
  disabled,
  onSellingStateChange,
  refreshOptionsOrders,
}: PositionRowProps) => {
  const styles = useStyles();
  const [selectedQuantity, setSelectedQuantity] = useState(position.quantity.toString());

  const quantityOptions = Array.from({ length: position.quantity }, (_, i) => (i + 1).toString());

  // Create a machine instance per position
  const [, send, actorRef] = useActor(sellFastMachine, {
    input: {
      requestService,
    },
  });

  const { isSelling, hasError, error } = useSelector(actorRef, state => ({
    isSelling: state.matches('selling'),
    hasError: state.matches({ selling: 'fail' }),
    error: state.context.error,
  }));

  useEffect(() => {
    if (hasError) {
      console.error(error);
    }
  }, [hasError, error]);

  useEffect(() => {
    onSellingStateChange(isSelling);
  }, [isSelling, onSellingStateChange]);

  // Add delay after refreshing orders to ensure we get latest data
  const refreshWithDelay = useCallback(async () => {
    await refreshOptionsOrders();
    // Give a small delay for the UI to update with new order data
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, [refreshOptionsOrders]);

  const startSell = useCallback(() => {
    send({
      type: 'SELL',
      quantity: parseInt(selectedQuantity, 10),
      link: position.link,
      targetOption: { id: position.strategyCode },
    });
    // Refresh orders after starting sell to capture new order ID
    refreshWithDelay();
  }, [send, selectedQuantity, position.link, position.strategyCode, refreshWithDelay]);

  const handleCancel = useCallback(() => {
    if (position.orderId) {
      send({
        type: 'CANCEL',
        targetOption: { id: position.orderId },
      });
    }
  }, [position.orderId, send]);

  useEffect(() => {
    actorRef.subscribe(state => {
      console.log('sellMachine state for position', position.id, state);
    });
  }, [actorRef, position.id]);

  return (
    <div className={styles.positionContainer}>
      <Toolbar className={styles.toolbar}>
        <div className={styles.positionInfo}>
          <div className={styles.positionInfoTop}>
            <span className={styles.text}>{position.symbol}</span>
            <span
              className={mergeClasses(
                styles.profitBase,
                parseFloat(position.profit) >= 0 ? styles.profitPositive : styles.profitNegative,
              )}>
              ${position.profit}
            </span>
          </div>
          <div className={styles.positionInfoBottom}>
            <span className={styles.text}>{position.expirationDate}</span>
            <span className={styles.text}>${position.strikePrice}</span>
            <span className={styles.text}>{capitalize(position.contractType)}</span>
          </div>
        </div>
        {position.orderId ? (
          <>
            <div className={styles.emptyCell}>Pending</div>
            {/* Placeholder for grid alignment */}
            <div className={styles.buttonContainer}>
              <Button appearance="secondary" className={styles.cancelButton} onClick={handleCancel}>
                CANCEL
              </Button>
            </div>
          </>
        ) : (
          <>
            <Dropdown
              className={styles.quantityDropdown}
              value={selectedQuantity}
              onOptionSelect={(_e, data) => setSelectedQuantity(data.optionValue ?? '1')}
              disabled={disabled || isSelling}>
              {quantityOptions.map(option => (
                <Option key={option} value={option}>
                  {option}
                </Option>
              ))}
            </Dropdown>
            <div className={styles.buttonContainer}>
              <Button
                className={styles.sellButton}
                appearance="primary"
                onClick={startSell}
                disabled={disabled || isSelling}>
                SELL
              </Button>
              <div className={styles.infoBox}>
                {hasError && <ErrorCircleFilled className={styles.errorIcon} />}
                {isSelling && !hasError && <Spinner size="extra-tiny" />}
              </div>
            </div>
          </>
        )}
      </Toolbar>
    </div>
  );
};

export const Sellx: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { output, refreshOptionsOrders } = useAggregatedPositions(); // In
  const styles = useStyles();
  const [isAnySelling, setIsAnySelling] = useState(false);
  const requestService = useService(IRequestService);
  const sidePanelMachineService = useService(ISidePanelMachineService);
  const activeTab = sidePanelMachineService.state.context.activeTab!;

  const handleSellingStateChange = useCallback((isSelling: boolean) => {
    setIsAnySelling(prev => isSelling || prev);
    if (!isSelling) {
      // Only reset to false if we check all positions and none are selling
      setTimeout(() => {
        setIsAnySelling(false);
      }, 0);
    }
  }, []);

  return (
    <div className={styles.root}>
      {output.map(position => (
        <PositionRow
          key={position.id}
          position={position}
          requestService={requestService}
          activeTab={activeTab}
          disabled={isAnySelling}
          onSellingStateChange={handleSellingStateChange}
          refreshOptionsOrders={refreshOptionsOrders}
        />
      ))}
    </div>
  );
};
