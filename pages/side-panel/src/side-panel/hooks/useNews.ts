import { useState, useEffect } from 'react';
import { autorun, IReader } from 'vs/base/common/observable';
import { IDisposable } from 'vs/base/common/lifecycle';
import { useService } from './useService';
import { IAppNewsService } from '../../services/news/appNews.service';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { StorageKeys } from '@shared/storage/types/storage.types';

export interface UseNewsResult {
  news: INewsItemModel[] | undefined;
  isApiKeyMissing: boolean | undefined; // undefined while loading, true if missing, false if present
}

export function useNews(): UseNewsResult {
  const [latestNews, setLatestNews] = useState<INewsItemModel[] | undefined>(undefined);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState<boolean | undefined>(undefined);
  const appNewsService = useService(IAppNewsService);
  const localAsyncStorage = useService(ILocalAsyncStorage);

  useEffect(() => {
    const disposables: IDisposable[] = [];

    // News observable
    const newsObservable = appNewsService.getLatestNewsObservable();
    setLatestNews(newsObservable.read(undefined)); // Read initial value

    disposables.push(
      autorun((reader: IReader) => {
        const newsUpdate = newsObservable.read(reader);
        setLatestNews(newsUpdate);
        console.log('[useNews] Latest News Update:', newsUpdate);
      }),
    );

    // Check API key status directly using localAsyncStorage
    const checkApiKeyStatus = async (): Promise<void> => {
      try {
        const storedKey = await localAsyncStorage.get(StorageKeys.GOOGLE_GEMINI_API_KEY);
        const isConfigured = typeof storedKey === 'string' && storedKey.trim() !== '';
        setIsApiKeyMissing(!isConfigured);
      } catch (error) {
        console.error('[useNews] Error checking for API key:', error);
        setIsApiKeyMissing(true); // Assume missing on error
      }
    };

    // Check initially
    checkApiKeyStatus();

    // Set up interval to check periodically (every 30 seconds)
    const apiKeyCheckInterval = setInterval(checkApiKeyStatus, 30000);

    return () => {
      disposables.forEach(disposable => disposable.dispose());
      clearInterval(apiKeyCheckInterval);
    };
  }, [appNewsService, localAsyncStorage]);

  return { news: latestNews, isApiKeyMissing };
}
