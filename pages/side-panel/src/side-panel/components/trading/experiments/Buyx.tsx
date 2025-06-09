import { useCallback, useEffect, useState } from 'react';
import {
  Dropdown,
  Option,
  makeStyles,
  Toolbar,
  Spinner,
  Button,
  tokens,
} from '@fluentui/react-components';
import { ErrorCircleFilled } from '@fluentui/react-icons';
import { useActor, useSelector } from '@xstate/react';

import { IRequestService } from '@shared/services/request.service';
import { useService } from '@src/side-panel/hooks/useService';
import { buyFastMachine, ContractType } from '@src/side-panel/machines/trading/buyFast.machine';
import { useAggregatedPositions } from '@src/side-panel/hooks/useAggregatedPositions';

const useStyles = makeStyles({
  root: { padding: '10px 0' },
  toolbar: {
    display: 'flex',
    gap: '0.5rem',
    backgroundColor: 'transparent',
    alignItems: 'space-between',
    maxWidth: '100%',
  },
  contractTypeDropdown: {
    flex: '1 0 auto',
    minWidth: 'auto',
  },
  quantityDropdown: {
    flex: '1 0 auto',
    minWidth: 'auto',
  },
  stockDropdown: {
    flex: '1 0 auto',
    minWidth: 'auto',
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    display: 'flex',
    backgroundColor: 'transparent',
    alignItems: 'center',
    padding: '4px 8px',
    position: 'relative',
  },
  buyButton: {
    flex: '1 0 100%',
    minWidth: 'auto',
  },
  infoBox: {
    position: 'absolute',
    flex: '1 0 32px',
    minWidth: 'auto',
    display: 'flex',
    alignItems: 'center',
    height: '32px',
    right: '18px',
    justifyContent: 'center',
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '20px',
    display: 'block',
  },
});

const stockOptions = ['QQQ', 'SPY'];
const contractTypes = ['CALL', 'PUT'];

export const Buyx = () => {
  const requestService = useService(IRequestService);
  const { refreshOptionsOrders } = useAggregatedPositions();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [state, send, actorRef] = useActor(buyFastMachine, {
    input: {
      requestService,
      refreshOptionsOrders,
    },
  });

  useEffect(() => {
    actorRef.subscribe(state => {
      console.log('buyFastMachine state:', state);
    });
  }, [actorRef]);

  const [quantity, setQuantity] = useState(1);
  const [stock, setStock] = useState('QQQ');
  const [contractType, setContractType] = useState<ContractType>('CALL');

  const { isBuying, hasError, error } = useSelector(actorRef, state => ({
    isBuying: state.matches('buying'),
    hasError: state.matches({ buying: 'fail' }),
    error: state.context.error,
  }));

  useEffect(() => {
    if (hasError) {
      console.error(error);
    }
  }, [hasError, error]);

  const startBuy = useCallback(() => {
    console.log('start buy');
    send({ type: 'BUY', quantity, stock, contractType });
  }, [send, quantity, stock, contractType]);

  const styles = useStyles();
  const quantityOptions = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

  return (
    <div className={styles.root}>
      <div className={styles.buttonContainer}>
        <Button
          className={styles.buyButton}
          appearance="primary"
          disabled={isBuying}
          onClick={startBuy}>
          BUY
        </Button>
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
      <Toolbar className={styles.toolbar}>
        <Dropdown
          disabled={isBuying}
          className={styles.contractTypeDropdown}
          onOptionSelect={(_e, data) => {
            setContractType((data.optionText ?? 'CALL') as ContractType);
          }}
          defaultValue="CALL"
          defaultSelectedOptions={['CALL']}>
          {contractTypes.map(option => (
            <Option key={option}>{option}</Option>
          ))}
        </Dropdown>
        <Dropdown
          disabled={isBuying}
          className={styles.quantityDropdown}
          onOptionSelect={(_e, data) => {
            setQuantity(parseInt(data.optionText ?? '1'));
          }}
          defaultValue="1"
          defaultSelectedOptions={['1']}>
          {quantityOptions.map(option => (
            <Option key={option}>{option}</Option>
          ))}
        </Dropdown>
        <Dropdown
          disabled={isBuying}
          className={styles.stockDropdown}
          onOptionSelect={(_e, data) => {
            setStock(data.optionText ?? 'QQQ');
          }}
          defaultValue="QQQ"
          defaultSelectedOptions={['QQQ']}>
          {stockOptions.map(option => (
            <Option key={option}>{option}</Option>
          ))}
        </Dropdown>
      </Toolbar>
    </div>
  );
};
