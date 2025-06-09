import { useCallback, useState, useEffect } from 'react';
import { autorun } from 'vs/base/common/observable';
import { IChatGPTService, IChatGPTArticleSnapshot } from '@src/services/chat/chatgpt.service';
import { useService } from './useService';

interface UseChatGPTReturn {
  openChatGPTTab: () => Promise<number>;
  connectToChatGPT: () => Promise<void>;
  sendTextToChatGPT: (text: string) => Promise<void>;
  startNewChat: () => Promise<void>;
  openTabWithContext: (url: string) => Promise<void>;
  isConnecting: boolean;
  connectionError: string | null;
  latestArticleSnapshot: IChatGPTArticleSnapshot | undefined;
}

export const useChatGPT = (): UseChatGPTReturn => {
  const chatGPTService = useService(IChatGPTService);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [latestArticleSnapshot, setLatestArticleSnapshot] = useState<
    IChatGPTArticleSnapshot | undefined
  >(undefined);

  useEffect(() => {
    if (!chatGPTService) return;
    const disposer = autorun(reader => {
      const snapshot = chatGPTService.onChatGPTArticleSnapshot.read(reader);
      setLatestArticleSnapshot(snapshot);
    });
    return () => {
      disposer.dispose();
    };
  }, [chatGPTService]);

  const openChatGPTTab = useCallback(async (): Promise<number> => {
    if (!chatGPTService) {
      throw new Error('ChatGPT service not available');
    }
    return await chatGPTService.openChatGPTTab();
  }, [chatGPTService]);

  const connectToChatGPT = useCallback(async (): Promise<void> => {
    if (!chatGPTService) {
      setConnectionError('ChatGPT service not available');
      return;
    }
    setIsConnecting(true);
    setConnectionError(null);
    try {
      // Only open a new tab if we don't have an active connection
      await openChatGPTTab();
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to connect to ChatGPT. Please try again.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [chatGPTService, openChatGPTTab]);

  const sendTextToChatGPT = useCallback(
    async (text: string): Promise<void> => {
      if (!chatGPTService) {
        // This state should ideally be handled by disabling UI elements if service is not available.
        console.error('ChatGPT service not available for sendTextToChatGPT');
        throw new Error('ChatGPT service not available');
      }
      try {
        await chatGPTService.sendTextToChatGPT(text);
      } catch (error) {
        console.error('useChatGPT: Failed to send text to ChatGPT:', error);
        // Propagate the error so the UI can potentially react to it.
        throw error;
      }
    },
    [chatGPTService],
  );

  const startNewChat = useCallback(async (): Promise<void> => {
    if (!chatGPTService) {
      console.error('useChatGPT: ChatGPT service not available for startNewChat');
      throw new Error('ChatGPT service not available');
    }
    try {
      await chatGPTService.startNewChat();
    } catch (error) {
      console.error('useChatGPT: Failed to start new chat:', error);
      throw error;
    }
  }, [chatGPTService]);

  const openTabWithContext = useCallback(
    async (url: string): Promise<void> => {
      if (!chatGPTService) {
        throw new Error('ChatGPT service not available');
      }
      try {
        await chatGPTService.openTabWithContextButton(url);
      } catch (error) {
        console.error('useChatGPT: Failed to open tab with context:', error);
        throw error;
      }
    },
    [chatGPTService],
  );

  return {
    openChatGPTTab,
    connectToChatGPT,
    sendTextToChatGPT,
    startNewChat,
    openTabWithContext,
    isConnecting,
    connectionError,
    latestArticleSnapshot,
  };
};
