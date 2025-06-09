import { AsyncStorageSchema } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';

export enum StorageKeys {
  OPEN_AI_API_KEY = 'openAiApiKey',
  GOOGLE_GEMINI_API_KEY = 'googleGeminiApiKey',
  ROBINHOOD_ACCOUNT_NUMBER = 'robinhoodAccountNumber',
  // Add other keys here as needed
}

export interface SidePanelAppStorageSchema extends AsyncStorageSchema {
  [StorageKeys.OPEN_AI_API_KEY]?: string;
  [StorageKeys.GOOGLE_GEMINI_API_KEY]?: string;
  [StorageKeys.ROBINHOOD_ACCOUNT_NUMBER]?: string;
  // other application settings can be added here
}
