import { useEffect, useState } from 'react';
import { autorun } from 'vs/base/common/observable';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { useService } from './useService';
import { ILogService } from '@shared/services/log.service';
import { ITraderService, IOrderSummary } from '@src/services/trader/trader.service';
import { BuyTraderData, SellTraderData, OrderDetails } from '@src/services/trader/types';

export interface OrdersData {
  pendingOrders: IOrderSummary[];
}

export const useTrader = () => {
  const trader = useService(ITraderService);
  const logger = useService(ILogService);
  const [buyData, setBuyData] = useState<BuyTraderData>({});
  const [sellData, setSellData] = useState<SellTraderData[]>([]);
  const [ordersData, setOrdersData] = useState<OrdersData>({ pendingOrders: [] });

  useEffect(() => {
    const disposables = new DisposableStore();

    // Handle orders data
    disposables.add(
      autorun(reader => {
        const orders = trader.ordersSummary$.read(reader);
        const pendingOrders: IOrderSummary[] = [];

        for (const order of orders.values()) {
          if (!['DONE', 'CANCELLED', 'ERROR'].includes(order.state)) {
            pendingOrders.push(order);
          }
        }

        setOrdersData({ pendingOrders });
      }),
    );

    // Use the derived buyTraderData$ observable
    disposables.add(
      autorun(reader => {
        const data = trader.buyTraderData$.read(reader);

        // Add logging wrapper for buy orders
        if (data.createOrder) {
          const originalCreateOrder = data.createOrder;
          data.createOrder = (orderDetails: OrderDetails) => {
            logger.log('Buy order initiated', {
              symbol: data.symbol,
              selectedExpirationDate: data.selectedExpirationDate,
              optionType: data.optionType,
            });
            originalCreateOrder(orderDetails);
          };
        }

        setBuyData(data);
      }),
    );

    // Use the derived sellTraderData$ observable
    disposables.add(
      autorun(reader => {
        const positions = trader.sellTraderData$.read(reader);

        // Add logging wrapper for sell orders
        const positionsWithLogging = positions.map(position => {
          if (position.createOrder) {
            const originalCreateOrder = position.createOrder;
            return {
              ...position,
              createOrder: (orderDetails: OrderDetails) => {
                logger.log('Sell order initiated', {
                  id: position.id,
                  symbol: position.symbol,
                  optionType: position.optionType,
                });
                originalCreateOrder(orderDetails);
              },
            };
          }
          return position;
        });

        setSellData(positionsWithLogging);
      }),
    );

    return () => {
      disposables.dispose();
    };
  }, [trader, logger]);

  return { buyData, sellData, ordersData };
};
