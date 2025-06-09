import { useEffect, useState } from 'react';
import { useService } from './useService';
import { autorun } from 'vs/base/common/observable';
import { IDataService } from '@src/services/data.service';
import {
  IPricebookDataService,
  type SimplifiedPricebookSnapshot,
} from '@src/services/pricebook/pricebookData.service';
import { IPricebookSnapshotResponse } from '@shared/services/request.types';

// Define the shape for pricebook data per symbol.
export interface PricebookSymbolData {
  currentSnapshot?: IPricebookSnapshotResponse;
  history: SimplifiedPricebookSnapshot[];
}

export type PricebookBySymbol = Record<string, PricebookSymbolData>;

export const usePricebook = () => {
  const dataService = useService(IDataService);
  const [pricebookBySymbol, setPricebookBySymbol] = useState<PricebookBySymbol>({});

  useEffect(() => {
    const symbols = ['QQQ', 'SPY', 'DIA'];
    const disposables: { dispose: () => void }[] = [];

    // Initialize state for each symbol.
    symbols.forEach(symbol => {
      // Retrieve the pricebook service.
      const pricebookService: IPricebookDataService =
        dataService.pricebooksService.getPricebook(symbol);

      // Set the initial state.
      setPricebookBySymbol(prev => ({
        ...prev,
        [symbol]: { history: [] },
      }));

      // Subscribe to formattedPricebookHistory$ observable.
      const dispose = autorun(reader => {
        const history = pricebookService.formattedPricebookHistory$.read(reader);
        setPricebookBySymbol(prev => ({
          ...prev,
          [symbol]: { history },
        }));
      });

      disposables.push(dispose);
    });

    return () => {
      // Cleanup autorun subscriptions.
      disposables.forEach(d => d.dispose());
    };
  }, [dataService]);

  return { pricebookBySymbol };
};
