import React from 'react';
import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { ISidePanelMachineService } from '@src/services/sidePanelMachine.service';
import { useService } from '../hooks/useService';
import { Panel } from '../components/Panel';
import { TradeSimulator } from '../pages/TradeSimulator';
import { Main } from '../pages/Main';
import { News } from '../pages/News';
import { ChatPage } from '../pages/ChatPage';
import { ChatGPTPage } from '../pages/ChatGPTPage';
import { useTabNavigationContext } from '../context/TabNavigationContext'; // IMPORT CONTEXT

const useStyles = makeStyles({
  root: {
    display: 'flex',
    padding: '10px',
    boxSizing: 'border-box',
    flex: '1 0 auto',
    position: 'relative',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
  deactivated: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 0 auto',
  },
  deactivatedText: {
    width: '100%',
    textAlign: 'center',
    padding: '16px',
    lineHeight: '1.5',
    textWrap: 'balance',
    '@media (max-width: 400px)': {
      fontSize: '14px',
      padding: '12px',
    },
    '@media (max-width: 280px)': {
      fontSize: '12px',
      padding: '8px',
      lineHeight: '1.4',
    },
  },
  pageContainer: {
    width: '100%',
    height: '100%',
    display: 'none',
  },
  pageVisible: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
});

export const Content: React.FC = () => {
  const styles = useStyles();
  const { currentPage } = useTabNavigationContext(); // USE CONTEXT
  const sidePanelMachineService = useService(ISidePanelMachineService);
  const [isAttached, setIsAttached] = React.useState(false);

  React.useEffect(() => {
    const attached = sidePanelMachineService.state.matches({ Active: 'WindowAttached' });
    setIsAttached(attached);
    const subscription = sidePanelMachineService.onSnapshot(snapshot => {
      setIsAttached(snapshot.matches({ Active: 'WindowAttached' }));
    });
    return () => subscription.dispose();
  }, [sidePanelMachineService]);

  return (
    <div className={styles.root}>
      {!isAttached ? (
        <Panel className={styles.deactivated}>
          <div className={styles.deactivatedText}>
            Please open <strong>Robinhood</strong> in this window to activate the side panel.
          </div>
        </Panel>
      ) : (
        <>
          <div
            className={mergeClasses(
              styles.pageContainer,
              currentPage === 'main' && styles.pageVisible, // Use currentPage from context
            )}>
            <Main />
          </div>
          <div
            className={mergeClasses(
              styles.pageContainer,
              currentPage === 'tradeSimulator' && styles.pageVisible, // Use currentPage from context
            )}>
            <TradeSimulator />
          </div>
          <div
            className={mergeClasses(
              styles.pageContainer,
              currentPage === 'news' && styles.pageVisible, // Use currentPage from context
            )}>
            <News />
          </div>
          <div
            className={mergeClasses(
              styles.pageContainer,
              currentPage === 'chat' && styles.pageVisible, // Use currentPage from context
            )}>
            <ChatPage />
          </div>
          <div
            className={mergeClasses(
              styles.pageContainer,
              currentPage === 'chatgpt' && styles.pageVisible, // Use currentPage from context
            )}>
            <ChatGPTPage />
          </div>
        </>
      )}
    </div>
  );
};
