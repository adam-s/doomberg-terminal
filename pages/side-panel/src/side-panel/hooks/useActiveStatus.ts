// useActiveStatus.ts
import { useState, useEffect } from 'react';
import { useService } from './useService';
import { ISettingsService } from '@shared/services/settings.service';

export const useActiveStatus = () => {
  const settingsService = useService(ISettingsService);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchActiveStatus = async () => {
      const isActive = await settingsService.isActive();
      if (isMounted) {
        setActive(isActive);
      }
    };

    fetchActiveStatus();

    const handleActiveChange = (isActive: boolean) => {
      if (isMounted) {
        setActive(isActive);
      }
    };

    const subscription = settingsService.onDidChangeActive(handleActiveChange);

    return () => {
      isMounted = false;
      if (subscription && typeof subscription.dispose === 'function') {
        subscription.dispose();
      }
    };
  }, [settingsService]);

  return active;
};
