import { Disposable, type IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { SidePanelAppStorageSchema, StorageKeys } from '@shared/storage/types/storage.types';
import {
  type Chat,
  GoogleGenAI,
  type Content,
  type Tool,
  // type GoogleSearchRetrieval, // This type might not be directly needed if we use the correct field name
  type SendMessageParameters,
} from '@google/genai';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';

export const IChatService = createDecorator<IChatService>('chatService');

/**
 * Options for sending a message.
 */
export interface ISendMessageOptions {
  enableSearch?: boolean;
}

/**
 * Base interface for chat services.
 * Defines the common contract for all chat service implementations.
 */
export interface IChatService extends IDisposable {
  readonly _serviceBrand: undefined;
  sendMessage(message: string, options?: ISendMessageOptions): Promise<string | undefined>;
  getChatHistory(): Promise<Content[]>;
}

/**
 * Base class for chat services.
 */
export class ChatService extends Disposable implements IChatService {
  public readonly _serviceBrand: undefined;
  private _ai!: GoogleGenAI;
  private _chat?: Chat;

  public constructor(
    @ILocalAsyncStorage
    private readonly _localStorageService: ILocalAsyncStorage<SidePanelAppStorageSchema>,
  ) {
    super();
  }

  private async _initializeAiClient(): Promise<boolean> {
    if (this._ai && this._chat) {
      return true; // Already initialized
    }
    try {
      const apiKey = await this._localStorageService.get<StorageKeys.GOOGLE_GEMINI_API_KEY>(
        StorageKeys.GOOGLE_GEMINI_API_KEY,
      );

      if (apiKey) {
        this._ai = new GoogleGenAI({ apiKey });
        // Default model, can be configured as needed
        // The ChatSession itself doesn't take enableSearch directly at creation for all messages.
        // It's often configured per sendMessage call if the API supports it, or via model capabilities.
        this._chat = this._ai.chats.create({ model: 'gemini-2.0-flash' }); // Using a model that supports search is key
        console.log('Google GenAI client and chat session initialized.');
        return true;
      } else {
        console.error('Google Gemini API key not found in storage.');
        return false;
      }
    } catch (error) {
      console.error('Error initializing Google GenAI client or chat session:', error);
      this._ai = undefined!; // Ensure it's marked as uninitialized
      this._chat = undefined;
      return false;
    }
  }

  public async sendMessage(
    userMessage: string,
    options?: ISendMessageOptions, // Updated signature
  ): Promise<string | undefined> {
    const initialized = await this._initializeAiClient();
    if (!initialized || !this._chat) {
      console.warn(
        'Chat session not initialized. API key might be missing or initialization failed.',
      );
      return 'Chat session could not be initialized. Please check your API key and console for errors.';
    }
    try {
      console.log(`Sending message to AI: "${userMessage}" with options:`, options);

      const requestTools: Tool[] = [];
      if (options?.enableSearch) {
        // Corrected tool name to googleSearch
        requestTools.push({ googleSearch: {} });
        console.log('Google Search enabled for this message.');
      }

      const messageParams: SendMessageParameters = {
        message: userMessage, // Pass the userMessage string directly
        config: requestTools.length > 0 ? { tools: requestTools } : undefined,
      };

      const response = await this._chat.sendMessage(messageParams);

      const responseText = response.text; // Use the .text getter

      if (responseText === undefined) {
        console.error('AI response does not contain text content:', response);
        // Return undefined to let the caller handle it, aligning with Promise<string | undefined>
        return undefined;
      }

      console.log('AI response text:', responseText);
      return responseText;
    } catch (error) {
      console.error('Error sending message via Google Gemini API:', error);
      if (error instanceof Error) {
        // Check for specific API error structure if available
        const apiError = error as { response?: { data?: { error?: { message?: string } } } };
        if (apiError.response?.data?.error?.message) {
          return `API Error: ${apiError.response.data.error.message}`;
        }
        return `Error: ${error.message}`;
      }
      return 'An unknown error occurred while sending the message.';
    }
  }

  public async getChatHistory(): Promise<Content[]> {
    const initialized = await this._initializeAiClient();
    if (!initialized || !this._chat) {
      console.warn('Chat session not initialized for getChatHistory.');
      return [];
    }
    try {
      const history = this._chat.getHistory();
      console.log('Chat history:', history);
      return history;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
  }

  public override dispose(): void {
    super.dispose();
    // Dispose of any managed resources here.
  }
}
