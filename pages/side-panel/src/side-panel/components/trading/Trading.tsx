import { useState } from 'react';
import { makeStyles, Tab, TabList, tokens } from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import { Buy } from './manual/Buy';
import { Orders } from './manual/Orders';
import { Sell } from './manual/Sell';
import { PriceChart } from '../charts/PriceChart';
// import { Ledger } from './ledger/Ledger';
import { useTrader } from '@src/side-panel/hooks/useTrader';
import { TradingGame } from './paper/TradingGame';
import { Rapid } from './manual/Rapid';
import { Pricebook } from '../pricebook/Pricebook';

type TradingTab = 'manual' | 'rapid' | 'paper' | 'pricebook';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  tabList: {
    paddingBottom: '4px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflowY: 'auto',
  },
});

export const Trading: React.FC = () => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<TradingTab>('paper');
  const { buyData, sellData, ordersData } = useTrader();
  // const quantData = useQuant();

  const handleTabSelect = (_: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value as TradingTab);
  };

  return (
    <div className={styles.root}>
      <TabList className={styles.tabList} selectedValue={selectedTab} onTabSelect={handleTabSelect}>
        <Tab id="manual-tab" value="manual">
          Manual
        </Tab>
        <Tab id="rapid-tab" value="rapid">
          Rapid
        </Tab>
        <Tab id="paper-tab" value="paper">
          Paper
        </Tab>
        <Tab id="pricebook-tab" value="pricebook">
          Pricebook
        </Tab>
      </TabList>

      <div className={styles.tabContent}>
        {selectedTab === 'manual' && (
          <div role="tabpanel" aria-labelledby="manual-tab">
            <Buy buyData={buyData} />
            <Orders ordersData={ordersData} />
            <Sell sellData={sellData} />
          </div>
        )}

        {selectedTab === 'rapid' && (
          <div role="tabpanel" aria-labelledby="rapid-tab">
            <PriceChart />
            <Rapid buyData={buyData} />
            <Orders ordersData={ordersData} />
            <Sell sellData={sellData} />
          </div>
        )}

        {selectedTab === 'paper' && (
          <div role="tabpanel" aria-labelledby="paper-tab">
            <PriceChart />
            <TradingGame />
          </div>
        )}

        {selectedTab === 'pricebook' && (
          <div
            role="tabpanel"
            aria-labelledby="pricebook-tab"
            style={{ height: '100%', overflow: 'hidden' }}>
            <Pricebook />
          </div>
        )}
      </div>
    </div>
  );
};
