import {
  AggregatedFlowData,
  HistoricalFlowTotals,
} from '@src/services/extrinsicValue/extrinsicValueUtils';
import { useService } from './useService';
import { useState, useEffect } from 'react';
import { IDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { IDataService } from '@src/services/data.service';

export interface SymbolData {
  historicalFlowTotals?: HistoricalFlowTotals; // Changed to optional
  lastTradePrice?: number;
  tradePrices?: number[];
  aggregatedFlowData?: AggregatedFlowData;
}

// New type alias for flowBySymbol
export type FlowBySymbol = Record<string, SymbolData>;

export interface ExtrinsicValueData {
  flowBySymbol: FlowBySymbol;
}

export const useExtrinsicValueData = (): ExtrinsicValueData => {
  const dataService = useService(IDataService);
  const [flowBySymbol, setFlowBySymbol] = useState<FlowBySymbol>({});

  useEffect(() => {
    const symbols = ['QQQ', 'SPY'];
    const disposables: IDisposable[] = [];

    const extrinsicDataService = dataService.extrinsicDataService;

    extrinsicDataService.subscribeToSymbols(symbols);

    const fetchSymbolData = async () => {
      for (const symbol of symbols) {
        const extrinsicValueFlowsData =
          await extrinsicDataService.getExtrinsicBySymbolAsync(symbol);

        disposables.push(
          autorun(reader => {
            const newHistoricalFlowTotals =
              extrinsicValueFlowsData.historicalFlowTotals$.read(reader);
            const optionsData = extrinsicValueFlowsData.optionDataService.optionsData$.read(reader);
            const tradePrices = extrinsicValueFlowsData.tradePrice$.read(reader);
            const aggregatedFlowData = extrinsicValueFlowsData.aggregatedFlowData$.read(reader);
            setFlowBySymbol(prev => ({
              ...prev,
              [symbol]: {
                historicalFlowTotals: newHistoricalFlowTotals,
                lastTradePrice: optionsData?.lastTradePrice,
                tradePrices,
                aggregatedFlowData: aggregatedFlowData,
              },
            }));
          }),
        );
      }
    };

    fetchSymbolData();

    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [dataService]); // Only depend on the stable service instance

  return { flowBySymbol };
};
