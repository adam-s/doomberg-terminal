import { useState, useEffect, useMemo } from 'react';
import { useService } from './useService';
import { IHistoricalDataPoint, IMarketDataHistoricals } from '@shared/services/request.types';
import { autorun } from 'vs/base/common/observable';
import { IDataService } from '@src/services/data.service';

export type DataPoint = {
  date: Date;
  closePrice: number;
};

// Rename IBidPriceSMA interface to reflect percent changes, but you may keep the name if desired
interface IBidPricePercentChanges {
  [ticker: string]: number[];
}

export const useHistoricals = () => {
  const dataService = useService(IDataService);
  const [historicals, setHistoricals] = useState<IMarketDataHistoricals>();
  // Renamed state variable
  const [bidPricePercentChanges, setBidPricePercentChanges] = useState<IBidPricePercentChanges>({});

  const dataByTicker = useMemo(() => {
    if (!historicals || !Array.isArray(historicals)) return {};

    const datasets: { [ticker: string]: DataPoint[] } = {};

    historicals.forEach(tickerData => {
      const ticker = tickerData.symbol;
      const data =
        tickerData?.historicals?.map((point: IHistoricalDataPoint) => ({
          date: new Date(point.begins_at),
          closePrice: parseFloat(point.close_price),
        })) || [];

      datasets[ticker] = data;
    });

    return datasets;
  }, [historicals]);

  useEffect(() => {
    const disposables = [
      autorun(reader => {
        const data = dataService.historicalsService.marketDataHistoricals.read(reader);
        if (data) {
          setHistoricals(data.results);
        }
      }),
      autorun(reader => {
        const data = dataService.quotesService.bidPricePercentChanges.read(reader);
        if (data) {
          // Use the new setter
          setBidPricePercentChanges(data);
        }
      }),
    ];
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [dataService]);

  return { historicals, bidPricePercentChanges, dataByTicker };
};
