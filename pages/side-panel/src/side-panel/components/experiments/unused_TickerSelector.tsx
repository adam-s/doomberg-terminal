/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import * as React from 'react';
import {
  Combobox,
  makeStyles,
  Option,
  tokens,
  useId,
  Card,
  Text,
  Button,
} from '@fluentui/react-components';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { Dismiss12Regular } from '@fluentui/react-icons';
import type { SelectionEvents, OptionOnSelectData } from '@fluentui/react-components';
import { Chain } from '@src/services/chains/chain';
import { autorun } from 'vs/base/common/observable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { useService } from '../../hooks/useService';
import { OptionsChainsService } from '@src/services/chains/optionsChains.service';
import { OptionsMarketDataService } from '@src/services/marketData/optionMarketData.service';

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalS}`,
  },
  combobox: {
    minWidth: '100%',
  },
  chainContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  chainCard: {
    padding: tokens.spacingVerticalS,
  },
  tickerHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: '100%',
    justifyContent: 'space-between',
  },
  datesList: {
    listStyleType: 'none',
    marginTop: tokens.spacingVerticalXS,
    marginBottom: 0,
    paddingLeft: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXXS,
    alignItems: 'center',
  },
  tagButton: {
    paddingInline: tokens.spacingHorizontalXXS,
  },
});

interface ChainProps {
  chain: Chain;
  onRemove: (symbol: string) => void;
}

const ChainComponent: React.FC<ChainProps> = ({ chain, onRemove }) => {
  const styles = useStyles();
  const dateListId = useId('date-list');

  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  useEffect(() => {
    const subscription = autorun(reader => {
      setExpirationDates(chain.expirationDates$.read(reader));
      setSelectedDates(chain.selectedDates$.read(reader));
    });
    return () => subscription.dispose();
  }, [chain]);

  const onDateSelect = useCallback(
    (event: SelectionEvents, data: OptionOnSelectData) => {
      chain.setSelectedDates(data.selectedOptions);
    },
    [chain],
  );

  const onDateTagRemove = useCallback(
    (dateToRemove: string) => {
      chain.setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
    },
    [chain, selectedDates],
  );

  return (
    <Card className={styles.chainCard}>
      <div className={styles.tickerHeader}>
        <Text weight="semibold">{chain.symbol}</Text>
        <Button
          appearance="primary"
          shape="circular"
          size="small"
          icon={<Dismiss12Regular />}
          onClick={() => onRemove(chain.symbol)}
          aria-label={`Remove ${chain.symbol}`}
        />
      </div>
      <Combobox
        multiselect
        placeholder="Select expiration dates"
        selectedOptions={selectedDates}
        onOptionSelect={onDateSelect}>
        {expirationDates.map(date => (
          <Option key={date}>{date}</Option>
        ))}
      </Combobox>

      {selectedDates.length > 0 && (
        <ul id={dateListId} className={styles.datesList}>
          {selectedDates.map(date => (
            <li key={date}>
              <Button
                className={styles.tagButton}
                size="small"
                shape="circular"
                appearance="primary"
                icon={<Dismiss12Regular />}
                iconPosition="after"
                onClick={() => onDateTagRemove(date)}
                aria-label={`Remove ${date}`}>
                {date}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const TickerSelector: React.FC = () => {
  const comboId = useId('ticker-combo');
  const styles = useStyles();

  const instantiationService = useService(IInstantiationService);
  const [chains, setChains] = useState<Chain[]>([]);

  const optionsChainsService = useMemo(() => {
    return instantiationService.createInstance(OptionsChainsService);
  }, [instantiationService]);

  const { setSymbols, chains$ } = optionsChainsService;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const optionMarketDataService = useMemo(() => {
    return instantiationService.createInstance(OptionsMarketDataService, undefined);
  }, [instantiationService]);

  // Add this effect to set default tickers
  // useEffect(() => {
  //   setSymbols(['QQQ', 'SPY', 'DIA']);
  // }, [setSymbols]);

  useEffect(() => {
    const disposable = autorun(reader => {
      const latestChains = chains$.read(reader);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      setChains([...latestChains]); // Convert readonly array to mutable
    });

    return () => {
      disposable.dispose();
    };
  }, [chains$]);

  const selectedTickers = useMemo(() => chains.map(chain => chain.symbol), [chains]);

  const tickerOptions = useMemo(() => ['QQQ', 'SPY', 'DIA'], []);

  const onTickerSelect = useCallback(
    (event: SelectionEvents, data: OptionOnSelectData) => {
      setSymbols(data.selectedOptions);
    },
    [setSymbols],
  );

  const onRemoveChain = useCallback(
    (symbol: string) => {
      setSymbols(selectedTickers.filter(t => t !== symbol));
    },
    [selectedTickers, setSymbols],
  );

  return (
    <div className={styles.root}>
      <Combobox
        id={comboId}
        className={styles.combobox}
        multiselect
        placeholder="Select tickers"
        selectedOptions={selectedTickers}
        onOptionSelect={onTickerSelect}>
        {tickerOptions.map(option => (
          <Option key={option}>{option}</Option>
        ))}
      </Combobox>

      {chains.length > 0 && (
        <div className={styles.chainContainer}>
          {chains.map(chain => (
            <ChainComponent key={chain.symbol} chain={chain} onRemove={onRemoveChain} />
          ))}
        </div>
      )}
    </div>
  );
};
