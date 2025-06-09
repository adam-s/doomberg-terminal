import { useEffect, useState } from 'react';
import { autorun } from 'vs/base/common/observable';
import { IAppNewsService } from '../../services/news/appNews.service';
import { useService } from './useService';
import { useTabNavigationContext } from '../context/TabNavigationContext';

export function useNewsAlerts() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appNewsService = useService(IAppNewsService);
  const { currentPage } = useTabNavigationContext();

  useEffect(() => {
    if (!appNewsService) {
      return;
    }

    const newsAlertService = appNewsService.getNewsAlertService();

    // Set up the current page checker
    newsAlertService.setCurrentPageChecker(() => currentPage === 'news');

    // Subscribe to unread count changes using autorun
    const disposable = autorun(reader => {
      const count = newsAlertService.unreadNewsCount$.read(reader);
      setUnreadCount(count);
    });

    return () => {
      disposable.dispose();
    };
  }, [appNewsService, currentPage]);

  const resetCount = () => {
    if (appNewsService) {
      appNewsService.getNewsAlertService().resetUnreadNewsCount();
    }
  };

  return { unreadCount, resetCount };
}
