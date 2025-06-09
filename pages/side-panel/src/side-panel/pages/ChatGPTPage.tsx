import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { Panel } from '../components/Panel';
import { Chat } from '../components/chat/ChatGPT';

const useStyles = makeStyles({
  root: {
    height: '100%',
    widows: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr',
  },
  column: {
    display: 'grid',
    gap: '10px',
    minHeight: 0,
    overflow: 'hidden',
    minWidth: 0,
  },
  panelContent: {
    minHeight: 0,
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
});

const ChatGPTPage: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="chat-page" className={styles.root}>
      <div className={styles.column}>
        <Panel className={styles.panelContent}>
          <Chat />
        </Panel>
      </div>
    </div>
  );
};

export { ChatGPTPage };
