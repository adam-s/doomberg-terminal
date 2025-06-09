import { useState, useEffect } from 'react';
import { IDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { useService } from './useService';
import { IDataService } from '@src/services/data.service';
import { CumulativeFlowsByExpirationAndStrike } from '@src/services/extrinsicValue/extrinsicValueUtils';
import { IExtrinsicDataService } from '@src/services/extrinsicValue/extrinsicData.service';

export interface StrikeFlowsData {
  flowsByExpirationAndStrike?: CumulativeFlowsByExpirationAndStrike;
  lastTradePrice?: number;
  isLoading: boolean;
  error?: Error;
}

export const useStrikeFlows = (symbol: string | undefined): StrikeFlowsData => {
  const dataService = useService(IDataService);
  const extrinsicDataService = dataService.extrinsicDataService as IExtrinsicDataService;

  const [flowsByExpirationAndStrike, setFlowsByExpirationAndStrike] = useState<
    CumulativeFlowsByExpirationAndStrike | undefined
  >(undefined);
  const [lastTradePrice, setLastTradePrice] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (!symbol) {
      setFlowsByExpirationAndStrike(undefined);
      setLastTradePrice(undefined);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const disposables: IDisposable[] = [];

    const fetchData = async () => {
      setIsLoading(true);
      setError(undefined);
      setLastTradePrice(undefined);
      try {
        const extrinsicValueFlowsData =
          await extrinsicDataService.getExtrinsicBySymbolAsync(symbol);

        if (isMounted) {
          disposables.push(
            autorun(reader => {
              const data =
                extrinsicValueFlowsData.cumulativeFlowsByExpirationAndStrike$.read(reader);
              const ltp = extrinsicValueFlowsData.lastTradePrice$.read(reader);
              if (isMounted) {
                setFlowsByExpirationAndStrike(data);
                setLastTradePrice(ltp);
              }
            }),
          );
          setIsLoading(false);
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e : new Error('Failed to fetch strike flows'));
          setLastTradePrice(undefined);
          setIsLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      isMounted = false;
      disposables.forEach(d => d.dispose());
    };
  }, [symbol, extrinsicDataService]);

  return { flowsByExpirationAndStrike, lastTradePrice, isLoading, error };
};
