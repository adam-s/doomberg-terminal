/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useService } from './useService';
import { IDataService } from '@src/services/data.service';
import { OpenInterestData } from '@src/services/openInterest/openInterestData.service';

export interface OpenInterestHookResult {
  openInterestData: OpenInterestData;
  isLoading: boolean;
  error: string | null;
  refreshData: (bustCache?: boolean) => Promise<void>;
  lastTradePrices: Record<string, number>;
}

export const useOpenInterestData = (symbols: string[]): OpenInterestHookResult => {
  const dataService = useService(IDataService);
  const [openInterestData, setOpenInterestData] = useState<OpenInterestData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!symbols.length) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await dataService.openInterestDataService.getOpenInterestData(symbols);
        setOpenInterestData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch open interest data');
        console.error('Error fetching open interest data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [dataService, symbols]);

  const refreshData = async (bustCache = true) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await dataService.openInterestDataService.getOpenInterestData(
        symbols,
        bustCache,
      );
      setOpenInterestData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch open interest data');
      console.error('Error refreshing open interest data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const lastTradePrices = useMemo(() => {
    const prices: Record<string, number> = {};
    Object.entries(openInterestData).forEach(([symbol, data]) => {
      if (data.lastTradePrice) {
        prices[symbol] = data.lastTradePrice;
      }
    });
    return prices;
  }, [openInterestData]);

  return {
    openInterestData,
    isLoading,
    error,
    refreshData,
    lastTradePrices,
  };
};
