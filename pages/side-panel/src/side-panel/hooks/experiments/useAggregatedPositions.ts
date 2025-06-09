/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useService } from './useService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { autorun } from 'vs/base/common/observable';
import type { IReader } from 'vs/base/common/observable';
import { AggregatedPositionsService } from '@src/services/aggregatedPositions/aggregatedPositions.service';
import type { IDisposable } from 'vs/base/common/lifecycle';
import {
  IOptionsAggregatedPositions,
  IOptionsMarketData,
  IOptionsOrder,
} from '@shared/services/request.types';
import { IDataService } from '@src/services/data.service';

export interface PositionOutput {
  id: string;
  symbol: string;
  contractType: string;
  expirationDate: string;
  strikePrice: string;
  quantity: number;
  profit: string;
  link: string;
  strategyCode: string;
  orderId?: string;
}

export const useAggregatedPositions = () => {
  const instantiationService = useService(IInstantiationService);
  const serviceRef = useRef<AggregatedPositionsService>();
  const [positions, setPositions] = useState<IOptionsAggregatedPositions[]>([]);
  const [optionsMarketData, setOptionsMarketData] = useState<IOptionsMarketData[]>([]);
  const [optionsOrders, setOptionsOrders] = useState<IOptionsOrder[]>([]);
  const [output, setOutput] = useState<PositionOutput[]>([]);

  const formatDate = useCallback((date: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, month, day] = date.split('-');
    return `${month}/${day}`;
  }, []);

  const findMarketData = useCallback(
    (optionId: string) => optionsMarketData?.find(data => data.instrument_id === optionId),
    [optionsMarketData],
  );

  useEffect(() => {
    const disposables: IDisposable[] = [];

    const setup = async () => {
      const dataService = instantiationService.invokeFunction(accessor =>
        accessor.get(IDataService),
      );
      const service = dataService.aggregatedPositionsService;
      serviceRef.current = service;

      disposables.push(
        autorun((reader: IReader) => {
          const positionsData = service.positions.read(reader);
          if (positionsData) {
            setPositions(positionsData);
          }
        }),
        autorun((reader: IReader) => {
          const marketData = service.marketData.read(reader);
          if (marketData) {
            setOptionsMarketData(marketData);
          }
        }),
        autorun((reader: IReader) => {
          const ordersData = service.optionsOrders.read(reader);
          if (ordersData) {
            setOptionsOrders(ordersData);
          }
        }),
        service,
      );
    };

    setup().catch(console.error);

    return () => {
      disposables.forEach(d => d.dispose());
      serviceRef.current = undefined;
    };
  }, [instantiationService]);

  // This need to useEffect instead of useMemo
  useMemo(() => {
    if (!positions.length || !optionsMarketData?.length) {
      setOutput([]);
      return;
    }

    type ProcessedPosition = {
      id: string;
      symbol: string;
      contractType: string;
      expirationDate: string;
      strikePrice: string;
      quantity: number;
      profit: string;
      link: string;
      strategyCode: string;
      orderId: string | undefined;
    };

    const processedOutput = positions
      .map(position => {
        const leg = position.legs[0];
        const marketData = findMarketData(leg.option_id);
        if (!marketData) return null;
        const matchingOrder = optionsOrders.find(order => {
          const orderLeg = order.legs[0];
          return (
            orderLeg?.option?.includes(leg.option_id) ||
            orderLeg?.long_strategy_code === leg.option_id + '_L1'
          );
        });

        const profit = (
          parseFloat(marketData.bid_price) -
          parseFloat(position.average_open_price) / 100
        ).toFixed(2);

        const quantity = parseInt(position.quantity, 10);
        const link = `https://robinhood.com/options/${position.strategy_code}`;
        return {
          id: position.id,
          symbol: position.symbol,
          contractType: leg.option_type,
          expirationDate: formatDate(leg.expiration_date),
          strikePrice: parseFloat(leg.strike_price).toFixed(2),
          quantity,
          profit,
          link,
          strategyCode: leg.option_id,
          orderId: matchingOrder?.id,
        } as ProcessedPosition;
      })
      .filter((item): item is ProcessedPosition => item !== null);

    setOutput(processedOutput as unknown as PositionOutput[]);
  }, [positions, optionsMarketData?.length, findMarketData, formatDate, optionsOrders]);

  const refreshOptionsOrders = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.refreshOptionsOrders();
    }
  }, []);

  return {
    positions,
    optionsMarketData,
    output,
    refreshOptionsOrders,
  };
};
