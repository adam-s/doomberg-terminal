import { useService } from './useService';
import { useEffect, useState, useRef } from 'react';
import { IDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { IDataService } from '@src/services/data.service';
import {
  SentimentDataPoint,
  IPairedOptionData,
  SMADataPoint,
  IVolatilitySkewPoint,
} from '@src/services/sentiment2/sentimentUtils';

export interface HookSentimentData {
  history: SentimentDataPoint[];
  sentiment: number;
  pairedOptions: IPairedOptionData[];
  sma10: number;
  smaHistory: SMADataPoint[];
  volatilitySkew: IVolatilitySkewPoint[]; // Use the updated interface type
}

export interface SentimentByExpirationData {
  expirationDates: string[];
  data: Map<string, HookSentimentData>;
}

export type SentimentBySymbol = Record<string, HookSentimentData>;
export type SentimentBySymbolAndExpiration = Record<string, SentimentByExpirationData>;

export const useSentiment2 = () => {
  const dataService = useService(IDataService);
  const sentimentService = dataService.sentimentService;
  const [sentimentBySymbol, setSentimentBySymbol] = useState<SentimentBySymbol>({});
  const [sentimentBySymbolAndExpiration, setSentimentBySymbolAndExpiration] =
    useState<SentimentBySymbolAndExpiration>({});

  // Use refs to track previous state for comparison without re-triggering effects
  const sentimentBySymbolRef = useRef<SentimentBySymbol>({});
  const sentimentBySymbolAndExpirationRef = useRef<SentimentBySymbolAndExpiration>({});

  useEffect(() => {
    const symbols = ['SPY', 'QQQ']; // SPY first, then QQQ
    const disposables: IDisposable[] = [];

    // Subscribe to symbols using the service method
    const unsubscribe = sentimentService.subscribeToSymbols(symbols);

    // Watch for sentiment data changes (overall)
    disposables.push(
      autorun(reader => {
        const sentimentMap = sentimentService.sentimentData$.read(reader);
        const newSentimentBySymbol: SentimentBySymbol = {};

        let needsUpdate = false;
        for (const symbol of symbols) {
          const sentimentDataInstance = sentimentMap.get(symbol);
          // Get the specific symbol's data from the ref
          const currentData = sentimentBySymbolRef.current[symbol];

          if (sentimentDataInstance) {
            // Read the data from the SentimentData instance observables
            const history = sentimentDataInstance.sentimentHistory$.read(reader);
            const currentSentiment = sentimentDataInstance.sentiment$.read(reader);
            const pairedOptions = sentimentDataInstance.pairedOptions$.read(reader);
            const sma10 = sentimentDataInstance.sentimentSMA10$.read(reader);
            const smaHistory = sentimentDataInstance.sentimentSMAHistory$.read(reader);
            const volatilitySkew =
              sentimentDataInstance.volatilitySkewByExpiration$.read(reader).get('') || [];

            newSentimentBySymbol[symbol] = {
              history,
              sentiment: currentSentiment,
              pairedOptions,
              sma10,
              smaHistory,
              volatilitySkew,
            };

            // Check if data actually changed using the ref's value
            if (
              !currentData ||
              currentData.sentiment !== currentSentiment ||
              currentData.sma10 !== sma10 ||
              currentData.history.length !== history.length ||
              currentData.smaHistory.length !== smaHistory.length ||
              currentData.pairedOptions.length !== pairedOptions.length
            ) {
              needsUpdate = true;
            }
          } else {
            // Handle case where data isn't available yet
            newSentimentBySymbol[symbol] = {
              history: [],
              sentiment: 0,
              pairedOptions: [],
              sma10: 0,
              smaHistory: [],
              volatilitySkew: [],
            };

            // Check if this represents a change from previous state using the ref's value
            if (
              currentData &&
              (currentData.sentiment !== 0 ||
                currentData.sma10 !== 0 ||
                currentData.history.length > 0 ||
                currentData.smaHistory.length > 0 ||
                currentData.pairedOptions.length > 0)
            ) {
              needsUpdate = true;
            }
          }
        }

        // Only update state if there's a change
        if (needsUpdate || Object.keys(sentimentBySymbolRef.current).length !== symbols.length) {
          // Update ref first to ensure latest comparison value for next autorun
          sentimentBySymbolRef.current = newSentimentBySymbol;
          // Then update the state
          setSentimentBySymbol(newSentimentBySymbol);
        }
      }),
    );

    // Watch for sentiment data by expiration date
    disposables.push(
      autorun(reader => {
        const sentimentMap = sentimentService.sentimentData$.read(reader);
        const newSentimentBySymbolAndExpiration: SentimentBySymbolAndExpiration = {};

        let needsUpdate = false;

        for (const symbol of symbols) {
          const sentimentDataInstance = sentimentMap.get(symbol);
          // Get the specific symbol's data from the ref
          const currentData = sentimentBySymbolAndExpirationRef.current[symbol];

          if (sentimentDataInstance) {
            // Read expiration-based data from the SentimentData instance
            const sentimentByExpiration = sentimentDataInstance.sentimentByExpiration$.read(reader);
            const historyByExpiration =
              sentimentDataInstance.sentimentHistoryByExpiration$.read(reader);
            const smaByExpiration = sentimentDataInstance.sentimentSMA10ByExpiration$.read(reader);
            const smaHistoryByExpiration =
              sentimentDataInstance.sentimentSMAHistoryByExpiration$.read(reader);
            const pairedOptionsByExpiration =
              sentimentDataInstance.pairedOptionsByExpiration$.read(reader);

            // Get all expiration dates
            const expirationDates = Array.from(sentimentByExpiration.keys()).sort();

            // Create a map of expiration date to sentiment data
            const dataMap = new Map<string, HookSentimentData>();

            for (const expDate of expirationDates) {
              dataMap.set(expDate, {
                history: historyByExpiration.get(expDate) ?? [],
                sentiment: sentimentByExpiration.get(expDate) ?? 0,
                sma10: smaByExpiration.get(expDate) ?? 0,
                smaHistory: smaHistoryByExpiration.get(expDate) ?? [],
                pairedOptions: pairedOptionsByExpiration.get(expDate) ?? [],
                volatilitySkew:
                  sentimentDataInstance.volatilitySkewByExpiration$.read(reader).get(expDate) || [],
              });
            }

            newSentimentBySymbolAndExpiration[symbol] = {
              expirationDates,
              data: dataMap,
            };

            // Check if data has changed
            if (
              !currentData ||
              currentData.expirationDates.length !== expirationDates.length ||
              JSON.stringify(currentData.expirationDates) !== JSON.stringify(expirationDates)
            ) {
              needsUpdate = true;
            } else {
              // Check if any expiration data has changed
              for (const expDate of expirationDates) {
                const newData = dataMap.get(expDate);
                const oldData = currentData.data.get(expDate);

                if (
                  !oldData ||
                  oldData.sentiment !== newData?.sentiment ||
                  oldData.sma10 !== newData?.sma10 ||
                  oldData.history.length !== newData?.history.length ||
                  oldData.smaHistory.length !== newData?.smaHistory.length
                ) {
                  needsUpdate = true;
                  break;
                }
              }
            }
          } else {
            // Handle case where data isn't available yet
            newSentimentBySymbolAndExpiration[symbol] = {
              expirationDates: [],
              data: new Map(),
            };

            // Check if this represents a change
            if (currentData && currentData.expirationDates.length > 0) {
              needsUpdate = true;
            }
          }
        }

        // Only update state if there's a change
        if (
          needsUpdate ||
          Object.keys(sentimentBySymbolAndExpirationRef.current).length !== symbols.length
        ) {
          // Update ref first
          sentimentBySymbolAndExpirationRef.current = newSentimentBySymbolAndExpiration;
          // Then update the state
          setSentimentBySymbolAndExpiration(newSentimentBySymbolAndExpiration);
        }
      }),
    );

    return () => {
      // Clean up subscriptions and disposables
      unsubscribe();
      disposables.forEach(d => d.dispose());
    };
  }, [sentimentService]); // Remove sentimentBySymbol from dependencies

  return { sentimentBySymbol, sentimentBySymbolAndExpiration };
};
