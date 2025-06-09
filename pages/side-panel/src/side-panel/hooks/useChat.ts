import { useState, useCallback, useEffect, useRef } from 'react';
import { useService } from './useService';
import { IChatService } from '../../services/chat/chat.service';
import { ICalendarService } from '@shared/features/calendar/calendar.service';
import { useTabNavigationContext } from '../context/TabNavigationContext';
import { isParsedEconomicEventData } from '@src/services/news/calendar/economic-calendar-parser';
import { EconomicImpactLevel } from '@shared/features/calendar/calendar.types';
import { getCalendarEventAnalysisPrompt } from '@src/services/news/calendar/calendar-chat-analysis';

// Define the system context prompt (for API)
const SYSTEM_CONTEXT_PROMPT =
  'System: You are an expert financial research assistant. Provide clear, concise, and accurate information about economic events and financial news. When asked for links or reports, try to provide them if possible using your search capabilities. Acknowledge this instruction with a brief confirmation.';

// Define the initial UI greeting message (not sent to API)
const UI_INITIAL_GREETING_MESSAGE_BODY = "I'm your economic researcher. How can I help you?";

export interface MessageItem {
  id: string;
  type: 'user' | 'assistant';
  body: string;
  author?: string;
  timestamp: string;
}

export interface UseChatReturn {
  messages: MessageItem[];
  inputValue: string;
  isLoading: boolean;
  handleInputChange: (newValue: string) => void;
  handleSendMessage: () => Promise<void>;
  clearChat: () => void;
}

// Helper function to create the initial UI greeting message
function createUiInitialGreetingMessage(): MessageItem {
  return {
    id: 'ui-initial-greeting',
    type: 'assistant',
    author: 'AI Assistant',
    body: UI_INITIAL_GREETING_MESSAGE_BODY,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

// Helper function to strip Markdown code fences
function stripMarkdownFences(rawText: string | undefined): string {
  if (!rawText) {
    return '';
  }
  let cleanText = rawText.trim(); // Trim whitespace first
  const markdownBlockPrefix = '```markdown'; // Match prefix without newline initially
  const genericBlockPrefix = '```';
  const blockSuffix = '```';

  // Handle "```markdown\n...\n```"
  if (cleanText.startsWith(markdownBlockPrefix) && cleanText.endsWith(blockSuffix)) {
    cleanText = cleanText.substring(
      markdownBlockPrefix.length,
      cleanText.length - blockSuffix.length,
    );
    if (cleanText.startsWith('\n')) {
      cleanText = cleanText.substring(1);
    }
    if (cleanText.endsWith('\n')) {
      cleanText = cleanText.substring(0, cleanText.length - 1);
    }
    return cleanText.trim();
  }

  // Handle generic "```\n...\n```" (e.g. if language is not specified)
  if (cleanText.startsWith(genericBlockPrefix) && cleanText.endsWith(blockSuffix)) {
    cleanText = cleanText.substring(
      genericBlockPrefix.length,
      cleanText.length - blockSuffix.length,
    );
    if (cleanText.startsWith('\n')) {
      cleanText = cleanText.substring(1);
    }
    if (cleanText.endsWith('\n')) {
      cleanText = cleanText.substring(0, cleanText.length - 1);
    }
    return cleanText.trim();
  }
  return rawText; // Return original if no fences found or malformed
}

export function useChat(): UseChatReturn {
  const chatService = useService(IChatService);
  const calendarService = useService(ICalendarService);

  const [messages, setMessages] = useState<MessageItem[]>([createUiInitialGreetingMessage()]); // Initialize with UI greeting
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { currentPage, navigationPayload, clearNavigationPayload } = useTabNavigationContext();

  const isSystemContextSetRef = useRef<boolean>(false);

  // Effect to handle incoming event navigation
  useEffect(() => {
    if (currentPage === 'chat' && navigationPayload && navigationPayload.page === 'chat') {
      const eventPayload = navigationPayload.payload;

      if (typeof eventPayload === 'string') {
        // No need to check isSystemContextSetRef here for event initiation
        const eventId: string = eventPayload;
        console.log('[useChat] Received eventId for chat initiation:', eventId);

        const initiateChatFromEvent = async (id: string) => {
          setIsLoading(true);
          // Set messages to UI greeting + loading/analysis message
          // The UI greeting is already there, so we'll append to it or replace subsequent messages.
          // For simplicity, we can reset to greeting then add analysis.
          setMessages([createUiInitialGreetingMessage()]);

          try {
            // 1. Ensure system context is set (API)
            if (!isSystemContextSetRef.current) {
              console.log('[useChat] Sending initial system context prompt (event flow)...');
              const systemAck = await chatService.sendMessage(SYSTEM_CONTEXT_PROMPT, {
                enableSearch: false,
              });
              console.log(
                '[useChat] System context prompt acknowledged (event flow):',
                systemAck || 'No explicit acknowledgment.',
              );
              isSystemContextSetRef.current = true;
            }

            const event = await calendarService.getEvent(id);

            if (!event || !isParsedEconomicEventData(event)) {
              console.error('[useChat] Event not found or not parsable for ID:', id);
              const eventNotFoundMessage: MessageItem = {
                id: 'event-not-found-error',
                type: 'assistant',
                author: 'AI Assistant',
                body: `Sorry, I could not find the details for event ID: ${id}. How else can I help?`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              };
              // Append error after initial greeting
              setMessages(prevMessages => [...prevMessages, eventNotFoundMessage]);
              return;
            }

            // 2. Get and send the event-specific analysis prompt (API)
            const analysisPrompt = getCalendarEventAnalysisPrompt(event);
            const enableSearchForEvent =
              event.impactLevel !== undefined && event.impactLevel >= EconomicImpactLevel.MEDIUM;

            console.log(
              `[useChat] Sending event analysis prompt. Search enabled: ${enableSearchForEvent}`,
            );
            const analysisResultText = await chatService.sendMessage(analysisPrompt, {
              enableSearch: enableSearchForEvent,
            });

            let aiFirstMessageBody: string;
            if (analysisResultText) {
              aiFirstMessageBody = stripMarkdownFences(analysisResultText);
            } else {
              aiFirstMessageBody = `Sorry, I could not retrieve an analysis for the event: "${event.eventName}".`;
              console.warn(
                `[useChat] No analysis result text received for event ${event.eventName}`,
              );
            }

            const aiAnalysisResponseMessage: MessageItem = {
              id: Date.now().toString() + '-ai-event-analysis',
              type: 'assistant',
              author: 'AI Assistant',
              body: aiFirstMessageBody,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            // Append analysis response after initial greeting
            setMessages(prevMessages => [...prevMessages, aiAnalysisResponseMessage]);
          } catch (error) {
            console.error('[useChat] Error initiating chat from event analysis:', error);
            const errorResponseMessage: MessageItem = {
              id: Date.now().toString() + '-error-event-analysis',
              type: 'assistant',
              author: 'AI Assistant',
              body: `Sorry, I encountered an issue preparing the analysis. ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            // Append error after initial greeting
            setMessages(prevMessages => [...prevMessages, errorResponseMessage]);
          } finally {
            setIsLoading(false);
            clearNavigationPayload();
          }
        };
        initiateChatFromEvent(eventId);
      }
    }
  }, [currentPage, navigationPayload, clearNavigationPayload, calendarService, chatService]);

  const handleInputChange = useCallback((newValue: string) => {
    setInputValue(newValue);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (inputValue.trim() === '') {
      return;
    }

    const userMessageText = inputValue;
    const userMessageItem: MessageItem = {
      id: Date.now().toString(),
      type: 'user',
      body: userMessageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prevMessages => [...prevMessages, userMessageItem]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 1. Ensure system context is set (API)
      if (!isSystemContextSetRef.current) {
        console.log('[useChat] Sending initial system context prompt (user message flow)...');
        const systemAck = await chatService.sendMessage(SYSTEM_CONTEXT_PROMPT, {
          enableSearch: false,
        });
        console.log(
          '[useChat] System context prompt acknowledged (user message flow):',
          systemAck || 'No explicit acknowledgment.',
        );
        isSystemContextSetRef.current = true;
      }

      // 2. Send the actual user message (API)
      const aiResponseBody = await chatService.sendMessage(userMessageText, {
        enableSearch: true,
      });

      let responseBody: string = 'Sorry, I could not understand the response.';
      if (aiResponseBody) {
        responseBody = stripMarkdownFences(aiResponseBody);
      } else {
        responseBody =
          'Sorry, I encountered an issue processing your request or the API key is missing.';
      }

      const aiResponseMessage: MessageItem = {
        id: Date.now().toString() + '-ai',
        type: 'assistant',
        author: 'AI Assistant',
        body: responseBody,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prevMessages => [...prevMessages, aiResponseMessage]);
    } catch (error) {
      console.error('[useChat] Error sending message or processing AI response:', error);
      const errorItem: MessageItem = {
        id: Date.now().toString() + '-error',
        type: 'assistant',
        author: 'AI Assistant',
        body: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prevMessages => [...prevMessages, errorItem]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, chatService]);

  const clearChat = useCallback(() => {
    setMessages([createUiInitialGreetingMessage()]); // Reset to UI greeting
    setInputValue('');
    setIsLoading(false);
    isSystemContextSetRef.current = false;
    console.log('[useChat] Chat cleared and system context flag reset.');
  }, []);

  return {
    messages,
    inputValue,
    isLoading,
    handleInputChange,
    handleSendMessage,
    clearChat,
  };
}
