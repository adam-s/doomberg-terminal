import * as React from 'react';
import { Button, makeStyles, Textarea, tokens } from '@fluentui/react-components';
import { Chat as FluentUIChat, ChatMessage, ChatMyMessage } from '@fluentui-contrib/react-chat';
import DOMPurify from 'dompurify';
import { useChatGPT } from '../../hooks/useChatGPT';
import { AddRegular, SendRegular } from '@fluentui/react-icons';
import { DarkScrollContainer } from '../common/DarkScrollContainer';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    boxSizing: 'border-box',
  },
  chatContainer: {
    flexGrow: 1,
    overflowY: 'auto',
    maxWidth: '100%',
    paddingLeft: '0',
  },
  inputArea: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: '10px',
    paddingBottom: '10px',
    paddingLeft: '16px',
    paddingRight: '16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    gap: '8px',
  },
  input: {
    flexGrow: 1,
  },
  chatMessageBody: {
    '& .fui-ChatMessage__body': {
      marginBottom: '16px',
      backgroundColor: tokens.colorNeutralBackground2,
    },
    '& .fui-ChatMessage': {
      marginLeft: '20px',
    },
  },
  loadingIndicator: {
    textAlign: 'center',
    padding: '10px',
    color: tokens.colorNeutralForeground2,
    fontStyle: 'italic',
  },
  styledMessageContent: {
    lineHeight: '1.5',
    wordBreak: 'break-word',
    '& a': {
      fontSize: tokens.fontSizeBase200,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      padding: `${tokens.spacingHorizontalXXS} ${tokens.spacingHorizontalXXS}`, // Smaller padding
      borderRadius: tokens.borderRadiusMedium,
      textDecoration: 'none',
      color: tokens.colorBrandForegroundLink,
      backgroundColor: 'transparent',
      display: 'inline-block',
      margin: `${tokens.spacingHorizontalXXS}`,
      // Removed transition for no animation
      boxSizing: 'border-box', // Ensure consistent sizing
      '&:hover': {
        backgroundColor: tokens.colorSubtleBackgroundHover,
        border: `1px solid ${tokens.colorNeutralStroke1Hover}`,
        color: tokens.colorBrandForegroundLinkHover,
        textDecoration: 'none',
        boxSizing: 'border-box',
      },
      '&:active': {
        backgroundColor: tokens.colorSubtleBackgroundPressed,
        border: `1px solid ${tokens.colorNeutralStroke1Pressed}`,
        color: tokens.colorBrandForegroundLinkPressed,
        boxSizing: 'border-box',
      },
      '&:focus-visible': {
        outline: `2px solid ${tokens.colorStrokeFocus2}`,
        outlineOffset: '1px',
        boxSizing: 'border-box',
      },
    },
  },
});

interface MessageContentProps {
  content: string;
  messageId: string;
  messageType: 'user' | 'assistant';
}

const MessageContent: React.FC<MessageContentProps> = ({ content, messageId, messageType }) => {
  const styles = useStyles();
  const sanitizedContent = React.useMemo(() => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'a',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'hr',
        'del',
        'ins',
        'div',
        'span',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-testid'],
      ALLOW_DATA_ATTR: true,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
  }, [content]);

  return (
    <div
      className={styles.styledMessageContent}
      aria-label={`${messageType === 'user' ? 'Your message' : 'Assistant message'}`}
      data-message-id={messageId}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};

interface DisplayMessage {
  id: string;
  type: 'user' | 'assistant';
  author: string;
  content: string;
  timestamp: string;
  articleId?: string;
}

const UI_INITIAL_GREETING_BODY = 'Hello! How can I assist you today?';

function createUiInitialGreeting(): DisplayMessage {
  return {
    id: `greeting-${Date.now()}`,
    type: 'assistant',
    author: 'AI Assistant',
    content: UI_INITIAL_GREETING_BODY,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export const Chat: React.FC = () => {
  const styles = useStyles();
  const {
    connectToChatGPT,
    isConnecting,
    connectionError,
    latestArticleSnapshot,
    sendTextToChatGPT,
    startNewChat,
    openTabWithContext,
  } = useChatGPT();
  const chatContentRef = React.useRef<HTMLDivElement>(null);

  const [displayMessages, setDisplayMessages] = React.useState<DisplayMessage[]>([
    createUiInitialGreeting(),
  ]);
  const [inputValue, setInputValue] = React.useState<string>('');

  React.useEffect(() => {
    connectToChatGPT();
  }, [connectToChatGPT]);

  React.useEffect(() => {
    const handleLinkClick = async (event: Event): Promise<void> => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A' && target.closest('.markdown-link')) {
        event.preventDefault(); // Prevent the browser from navigating right away.

        const href = (target as HTMLAnchorElement).href;
        if (!href) {
          return;
        }

        try {
          await openTabWithContext(href);
        } catch (error) {
          console.error('Failed to open tab with context:', error);
        }
      }
    };

    const chatContent = chatContentRef.current;
    if (chatContent) {
      chatContent.addEventListener('click', handleLinkClick);
      return () => {
        chatContent.removeEventListener('click', handleLinkClick);
      };
    }
    return undefined;
  }, [openTabWithContext]);

  React.useEffect(() => {
    if (!latestArticleSnapshot) {
      return;
    }
    const { articleId, htmlContent } = latestArticleSnapshot;
    const articleTimestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    setDisplayMessages(prevMessages => {
      // Find the existing assistant message for this articleId
      const existingMessageIndex = prevMessages.findIndex(
        msg => msg.type === 'assistant' && msg.articleId === articleId,
      );

      if (existingMessageIndex !== -1) {
        // Update existing assistant message with new content
        return prevMessages.map((msg, index) =>
          index === existingMessageIndex
            ? { ...msg, content: htmlContent, timestamp: articleTimestamp }
            : msg,
        );
      } else {
        // Add a new assistant message for the new article
        return [
          ...prevMessages,
          {
            id: `assistant-${articleId}-${Date.now()}`,
            type: 'assistant',
            author: 'AI Assistant',
            content: htmlContent,
            timestamp: articleTimestamp,
            articleId: articleId,
          },
        ];
      }
    });
  }, [latestArticleSnapshot]);

  React.useEffect(() => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight;
    }
  }, [displayMessages]);

  const handleInputChange = React.useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleSendMessage = React.useCallback(async () => {
    if (inputValue.trim() === '') return;
    const userMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      author: 'You',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setDisplayMessages(prevMessages => [...prevMessages, userMessage]);
    const messageToSend = inputValue;
    setInputValue('');
    try {
      await sendTextToChatGPT(messageToSend);
    } catch (error) {
      // Log the error and potentially show a user-facing message
      console.error('Failed to send message:', error);
      // Example: set an error state here to display in the UI
      // setSendMessageError("Failed to send message. Please try again.");
    }
  }, [inputValue, sendTextToChatGPT]);

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleNewChat = React.useCallback(async () => {
    setDisplayMessages([createUiInitialGreeting()]);
    setInputValue('');
    try {
      await startNewChat();
    } catch (error) {
      console.error('Failed to start new chat:', error);
      // You could set an error state here to display to the user if needed
    }
  }, [startNewChat]);

  return (
    <div className={styles.root}>
      <DarkScrollContainer className={styles.chatContainer}>
        <FluentUIChat ref={chatContentRef} className={styles.chatContainer}>
          {isConnecting && !displayMessages.some(msg => msg.id.startsWith('greeting')) && (
            <div className={styles.loadingIndicator}>Connecting to ChatGPT...</div>
          )}
          {connectionError && (
            <div
              className={styles.loadingIndicator}
              style={{ color: tokens.colorPaletteRedForeground1 }}>
              {connectionError}
            </div>
          )}
          {displayMessages.map(msg =>
            msg.type === 'user' ? (
              <ChatMyMessage key={msg.id} timestamp={msg.timestamp}>
                <MessageContent content={msg.content} messageId={msg.id} messageType="user" />
              </ChatMyMessage>
            ) : (
              <div key={msg.id} className={styles.chatMessageBody}>
                <ChatMessage author={msg.author} timestamp={msg.timestamp}>
                  <MessageContent content={msg.content} messageId={msg.id} messageType={msg.type} />
                </ChatMessage>
              </div>
            ),
          )}
        </FluentUIChat>
      </DarkScrollContainer>
      <div className={styles.inputArea}>
        <Textarea
          value={inputValue}
          onChange={(_e, data) => handleInputChange(data.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Type your message..."
          className={styles.input}
          aria-label="Chat message input"
          textarea={{ rows: 1 }}
          resize="vertical"
        />
        <Button
          icon={<AddRegular />}
          appearance="secondary"
          onClick={handleNewChat}
          aria-label="New chat"
        />
        <Button
          icon={<SendRegular />}
          appearance="primary"
          onClick={handleSendMessage}
          aria-label="Send message"
          disabled={isConnecting || inputValue.trim() === ''}
        />
      </div>
    </div>
  );
};
