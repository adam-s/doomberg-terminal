import * as React from 'react';
import { Textarea, Button, makeStyles, tokens } from '@fluentui/react-components'; // Changed Input to Textarea
import { Chat as FluentUIChat, ChatMessage, ChatMyMessage } from '@fluentui-contrib/react-chat';
import { SendRegular, AddRegular } from '@fluentui/react-icons'; // Added AddRegular
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { useChat } from '../../hooks/useChat'; // Import the hook
import { DarkScrollContainer } from '../common/DarkScrollContainer';
// import { useTabNavigationContext } from '../../context/TabNavigationContext'; // Removed import

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
    gap: '8px', // Added gap for spacing between buttons
  },
  input: {
    flexGrow: 1,
    // marginRight: '8px', // Removed, gap in parent now handles spacing
  },
  chatMessageBody: {
    '& .fui-ChatMessage__body': {
      marginBottom: '16px',
      backgroundColor: tokens.colorNeutralBackground2,
      '& p': {
        // Ensure paragraphs within markdown have no extra margin
        // margin: 0,
      },
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
});

interface MessageContentProps {
  content: string | Record<string, unknown>;
  messageId: string;
  messageType: 'user' | 'assistant';
}

const MessageContent: React.FC<MessageContentProps> = ({ content, messageId, messageType }) => {
  const processedContent = React.useMemo(() => {
    if (typeof content !== 'string') {
      try {
        const parsedContent = typeof content === 'object' ? content : JSON.parse(content as string);

        if (parsedContent.parts && Array.isArray(parsedContent.parts)) {
          return parsedContent.parts.map((part: { text: string }) => part.text).join('');
        }

        return JSON.stringify(parsedContent, null, 2);
      } catch {
        return String(content);
      }
    }

    return content;
  }, [content]);

  const sanitizedContent = React.useMemo(() => {
    return DOMPurify.sanitize(processedContent, {
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
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });
  }, [processedContent]);

  const markdownComponents = React.useMemo(
    () => ({
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
          {children}
        </a>
      ),
      code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
        const isInline = !className?.includes('language-');
        return isInline ? (
          <code
            style={{
              backgroundColor: tokens.colorNeutralBackground3,
              padding: '2px 4px',
              borderRadius: '3px',
              fontSize: '0.875em',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            }}
            {...props}>
            {children}
          </code>
        ) : (
          <pre
            style={{
              backgroundColor: tokens.colorNeutralBackground3,
              padding: '12px',
              borderRadius: '6px',
              overflow: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            }}>
            <code {...props}>{children}</code>
          </pre>
        );
      },
      blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
          style={{
            margin: '8px 0',
            paddingLeft: '12px',
            borderLeft: `3px solid ${tokens.colorBrandBackground}`,
            fontStyle: 'italic',
            color: tokens.colorNeutralForeground2,
          }}
          {...props}>
          {children}
        </blockquote>
      ),
    }),
    [],
  );

  return (
    <div
      aria-label={`${messageType === 'user' ? 'Your message' : 'Assistant message'}: ${processedContent}`}
      data-message-id={messageId}
      style={{
        lineHeight: '1.5',
        wordBreak: 'break-word',
      }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
};

export const Chat = () => {
  const styles = useStyles();
  const { messages, inputValue, isLoading, handleInputChange, handleSendMessage, clearChat } =
    useChat(); // Added clearChat
  // const { currentPage, navigationPayload, clearNavigationPayload } = useTabNavigationContext(); // Removed context hook
  const chatContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const onFluentInputChange = React.useCallback(
    (_event: React.ChangeEvent<HTMLTextAreaElement>, data: { value: string }) => {
      // Changed HTMLInputElement to HTMLTextAreaElement
      handleInputChange(data.value);
    },
    [handleInputChange],
  );

  const onInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Changed HTMLInputElement to HTMLTextAreaElement
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!isLoading) {
          handleSendMessage();
        }
      }
    },
    [handleSendMessage, isLoading],
  );

  const onSendButtonClick = React.useCallback(() => {
    if (!isLoading) {
      handleSendMessage();
    }
  }, [handleSendMessage, isLoading]);

  const onNewChatButtonClick = React.useCallback(() => {
    clearChat();
  }, [clearChat]);

  return (
    <DarkScrollContainer className={styles.root}>
      <FluentUIChat ref={chatContainerRef} className={styles.chatContainer}>
        {messages.map(msg =>
          msg.type === 'user' ? (
            <div key={msg.id} className={styles.chatMessageBody}>
              <ChatMyMessage key={msg.id} timestamp={msg.timestamp}>
                <MessageContent content={msg.body} messageId={msg.id} messageType="user" />
              </ChatMyMessage>
            </div>
          ) : (
            <div key={msg.id} className={styles.chatMessageBody}>
              <ChatMessage author={msg.author} timestamp={msg.timestamp}>
                <MessageContent content={msg.body} messageId={msg.id} messageType="assistant" />
              </ChatMessage>
            </div>
          ),
        )}
        {isLoading && <div className={styles.loadingIndicator}>AI Assistant is thinking...</div>}
      </FluentUIChat>
      <div className={styles.inputArea}>
        <Textarea // Changed Input to Textarea
          value={inputValue}
          onChange={onFluentInputChange}
          onKeyDown={onInputKeyDown}
          placeholder="Type your message..."
          className={styles.input}
          aria-label="Chat message input"
          disabled={isLoading}
          textarea={{ rows: 1 }} // Start with 1 row, will auto-resize
          resize="vertical" // Allow vertical resize
        />
        <Button
          icon={<AddRegular />}
          appearance="secondary" // Or 'outline' or 'transparent' for less emphasis
          onClick={onNewChatButtonClick}
          aria-label="New chat"
          disabled={isLoading} // Optionally disable while loading if clearing chat is disruptive
        />
        <Button
          icon={<SendRegular />}
          appearance="primary"
          onClick={onSendButtonClick}
          aria-label="Send message"
          disabled={isLoading}></Button>
      </div>
    </DarkScrollContainer>
  );
};
