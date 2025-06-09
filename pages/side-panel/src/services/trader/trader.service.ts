import { Disposable } from 'vs/base/common/lifecycle';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { Chain, OptionType, SymbolType } from './chain';
import {
  observableValue,
  ISettableObservable,
  IObservable,
  derived,
  autorun,
} from 'vs/base/common/observable';
import { Order, State } from './order';
import {
  BuyOrderDetails,
  SellOrderDetails,
  OrderDetails,
  BuyTraderData,
  SellTraderData,
} from './types';
import { BuyOrder } from './buyOrder';
import { SellOrder } from './sellOrder';
import { IOptionsAggregatedPositions, IOptionsMarketData } from '@shared/services/request.types';
import { IRequestService } from '@shared/services/request.service';
import { ITimerService } from '@src/services/timer.service';

export interface ITraderService {
  readonly _serviceBrand: undefined;
  readonly chain$: ISettableObservable<Chain | undefined>;
  readonly positions$: IObservable<Map<string, IOptionsAggregatedPositions>>;
  readonly positionsSummary$: IObservable<Map<string, IPositionSummary>>;
  readonly positionsMarketData: Map<string, IOptionsMarketData>;
  readonly orders$: IObservable<Map<string, Order>>;
  readonly ordersSummary$: IObservable<Map<string, IOrderSummary>>;
  // Add new derived observables
  readonly buyTraderData$: IObservable<BuyTraderData>;
  readonly sellTraderData$: IObservable<SellTraderData[]>;
  refreshChain(symbol?: SymbolType, optionType?: OptionType): void;
  createOrder(orderDetails: OrderDetails): void;
  removeOrder(instrumentId: string): void;
  cancelOrder(instrumentId: string): Promise<void>;
}

export const ITraderService = createDecorator<ITraderService>('traderService');

export interface IPositionSummary {
  id: string;
  symbol: string;
  optionType: string;
  positionType: string;
  strikePrice: number;
  expirationDate: string;
  quantity: number;
  bidPrice: number;
  profitLoss: number;
}

export interface IOrderSummary {
  id: string;
  symbol: string;
  state: State;
  actionText: string; // "buy to open" | "sell to close"
  priceValue: number;
  priceType: 'limit' | 'market';
  strikePrice: number;
  optionType: 'Call' | 'Put';
  expirationDate: string; // Formatted as "2/12"
  quantity: number;
}

export class TraderService extends Disposable implements ITraderService {
  declare readonly _serviceBrand: undefined;

  // Replace private _syncInterval with timer ID
  private readonly _traderId = 'trader-sync';

  private readonly _positions$ = observableValue<Map<string, IOptionsAggregatedPositions>>(
    'positions',
    new Map(),
  );
  private readonly _positionsMarketData = new Map<string, IOptionsMarketData>();

  private readonly _orders$ = observableValue<Map<string, Order>>('orders', new Map());
  private readonly _chain$ = observableValue<Chain | undefined>('chain', undefined);

  public readonly positions$ = this._positions$;
  public get positionsMarketData(): Map<string, IOptionsMarketData> {
    return this._positionsMarketData;
  }
  public readonly orders$ = this._orders$;
  public readonly chain$ = this._chain$;

  public readonly positionsSummary$ = derived(reader => {
    const positions = this._positions$.read(reader);
    const summaries = new Map<string, IPositionSummary>();

    positions.forEach((position, id) => {
      const leg = position.legs[0]; // Assuming single-leg positions for now
      const marketData = this._positionsMarketData.get(leg.option_id);

      if (marketData) {
        const bidPrice = Number(marketData.bid_price);
        const averageOpenPrice = Number(position.average_open_price);
        const quantity = Number(position.quantity);
        summaries.set(id, {
          id: marketData.instrument_id,
          symbol: position.symbol,
          optionType: leg.option_type,
          positionType: leg.position_type,
          strikePrice: Number(leg.strike_price),
          expirationDate: leg.expiration_date,
          quantity,
          bidPrice,
          profitLoss: (bidPrice * 100 - averageOpenPrice) * quantity,
        });
      }
    });

    return summaries;
  });

  public readonly ordersSummary$ = derived(reader => {
    const orders = this._orders$.read(reader);
    const summaries = new Map<string, IOrderSummary>();

    orders.forEach((order, id) => {
      const response = order.orderResponse;
      if (!response || !response.legs[0]) return;

      const leg = response.legs[0];
      const actionText = `${leg.side} to ${leg.position_effect}`;

      const date = new Date(leg.expiration_date + 'T05:00:00Z');
      const [month, day] = date
        .toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          timeZone: 'America/New_York',
        })
        .split('/');

      summaries.set(id, {
        id: response.id,
        symbol: response.chain_symbol,
        state: order.state,
        actionText,
        priceValue: Number(response.price),
        priceType: response.type as 'limit' | 'market',
        strikePrice: Number(leg.strike_price),
        optionType: (leg.option_type.charAt(0).toUpperCase() +
          leg.option_type.slice(1).toLowerCase()) as 'Call' | 'Put',
        expirationDate: `${month}/${day}`,
        quantity: Number(response.quantity),
      });
    });

    return summaries;
  });

  // Add new derived observables
  public readonly buyTraderData$ = derived(reader => {
    const chain = this._chain$.read(reader);

    if (!chain) {
      return {};
    }

    return {
      symbol: chain.symbol,
      marketDataItems: chain.marketData$.read(reader),
      askPrice: chain.askPrice$.read(reader),
      expirationDates: chain.expirationDates.get(),
      selectedExpirationDate: chain.selectedExpirationDate.read(reader),
      optionType: chain.optionType.read(reader),
      setSelectedExpirationDate: chain.setSelectedExpirationDate,
      setOptionType: chain.setOptionType,
      refreshChain: this.refreshChain,
      createOrder: (orderDetails: OrderDetails) => this.createOrder(orderDetails),
      findClosestOptionByDelta: chain.findClosestOptionByDelta,
    };
  });

  public readonly sellTraderData$ = derived(reader => {
    const positions = this.positionsSummary$.read(reader); // Use public property instead of private

    return Array.from(positions.values()).map((position: IPositionSummary) => ({
      // Add explicit type annotation
      id: position.id,
      symbol: position.symbol as SymbolType,
      optionType: position.optionType as OptionType,
      positionType: position.positionType,
      strikePrice: position.strikePrice,
      expirationDate: position.expirationDate,
      quantity: position.quantity,
      bidPrice: position.bidPrice,
      profitLoss: position.profitLoss,
      createOrder: (orderDetails: OrderDetails) => this.createOrder(orderDetails),
    }));
  });

  constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
    @IRequestService private readonly _requestService: IRequestService,
    @ITimerService private readonly _timerService: ITimerService,
  ) {
    super();
    this.refreshChain();
    this._startSync();
  }

  public refreshChain = (symbol?: SymbolType, optionType?: OptionType): void => {
    const chain = this._register(
      this._instantiationService.createInstance(Chain, symbol, optionType),
    );
    this._chain$.set(chain, undefined);
  };

  public createOrder = (orderDetails: OrderDetails): void => {
    const order = this.createOrderInstance(orderDetails);
    if (order) order.processOrder();
    const updatedOrders = new Map(this._orders$.get());
    updatedOrders.set(order.instrumentId, order);
    this._orders$.set(updatedOrders, undefined);
  };

  private createOrderInstance(details: OrderDetails): Order {
    if (details.type === 'buy') {
      const buyDetails = details as BuyOrderDetails;
      if (!['CALL', 'PUT'].includes(buyDetails.contractType)) {
        throw new Error('Invalid buy order details provided');
      }
      return this._register(this._instantiationService.createInstance(BuyOrder, buyDetails));
    }

    if (details.type === 'sell') {
      return this._register(this._instantiationService.createInstance(SellOrder, details));
    }

    throw new Error('Invalid order details provided');
  }

  public removeOrder(instrumentId: string): void {
    const updatedOrders = new Map(this._orders$.get());
    const order = updatedOrders.get(instrumentId);
    if (order) {
      order.dispose();
      updatedOrders.delete(instrumentId);
      this._orders$.set(updatedOrders, undefined);
    }
  }

  public async cancelOrder(instrumentId: string): Promise<void> {
    const order = this._orders$.get().get(instrumentId);
    if (!order || !order.id) {
      console.warn('Cannot cancel order: Order not found or missing ID');
      return;
    }

    try {
      await this._requestService.cancelOptionsOrder(order.id);
      order.state = State.Cancelling;

      // Update the orders map to trigger UI update
      const updatedOrders = new Map(this._orders$.get());
      updatedOrders.set(instrumentId, order);
      this._orders$.set(updatedOrders, undefined);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      throw error;
    }
  }

  private _startSync(): void {
    // Initial sync
    this._syncPositions();
    // Setup periodic sync using the timer service
    this._timerService.createTimer(this._traderId, 1000);
    this._timerService.startTimer(this._traderId);

    // Register the autorun subscription for periodic updates
    this._register(
      autorun(reader => {
        // Read the tick value to create a subscription
        this._timerService.getTick(this._traderId).read(reader);
        // Run the sync operations
        this._syncPositions();
        this._syncOrders();
      }),
    );
  }

  private async _syncOrders(): Promise<void> {
    try {
      const response = await this._requestService.fetchAllOptionsOrders();
      const existingOrders = this._orders$.get();
      const updatedOrders = new Map<string, Order>();

      // Create a Set of active order IDs for O(1) lookups
      const activeOrderIds = new Set(response.map(order => order.id));

      // Dispose orders that no longer exist first
      existingOrders.forEach((order, instrumentId) => {
        if (activeOrderIds.has(instrumentId)) {
          updatedOrders.set(instrumentId, order);
        } else {
          order.dispose();
        }
      });

      // Process new orders
      response.forEach(orderData => {
        if (!existingOrders.has(orderData.id)) {
          const leg0 = orderData.legs[0];
          const orderDetails: OrderDetails =
            leg0.side.toLowerCase() === 'buy'
              ? ({
                  id: leg0.id,
                  type: 'buy',
                  quantity: parseFloat(orderData.quantity),
                  optionId: leg0.option, // corrected property name
                  strikePrice: parseFloat(leg0.strike_price),
                  executionPrice: parseFloat(orderData.price),
                  contractType: leg0.option_type.toUpperCase() as 'CALL' | 'PUT',
                } as BuyOrderDetails)
              : ({
                  id: leg0.id,
                  type: 'sell',
                  quantity: parseFloat(orderData.quantity),
                  optionId: leg0.option, // corrected property name
                  strikePrice: parseFloat(leg0.strike_price),
                  executionPrice: parseFloat(orderData.price),
                } as SellOrderDetails);

          const order = this.createOrderInstance(orderDetails);
          order.orderResponse = orderData;
          order.state = State.AwaitingFulfillment;
          updatedOrders.set(orderData.id, order);
        } else {
          // Update existing order's response
          const existingOrder = existingOrders.get(orderData.id);
          if (existingOrder) {
            existingOrder.orderResponse = orderData;
          }
        }
      });

      this._orders$.set(updatedOrders, undefined);
    } catch (error) {
      console.error('Failed to sync orders:', error);
    }
  }

  private async _syncPositions(): Promise<void> {
    try {
      // Fetch positions and validate the response
      const positionsResponse = await this._requestService.fetchAllOptionsAggregatedPositions();
      const positions = positionsResponse;

      if (!positions) {
        console.error('Invalid positions response received');
        return;
      }

      // Build a map of positions keyed by position ID
      const positionsMap = new Map<string, IOptionsAggregatedPositions>(
        positions.map(position => [position.id, position]),
      );

      // Extract unique instrument IDs from all position legs
      const instrumentIds = Array.from(
        new Set(positions.flatMap(position => position.legs.map(leg => leg.option_id))),
      );

      // Fetch and build market data if instrument IDs are available
      let marketDataMap = new Map<string, IOptionsMarketData>();
      if (instrumentIds.length > 0) {
        const marketDataResponse = await this._requestService.fetchOptionsMarketData(instrumentIds);
        const marketDataResults = marketDataResponse?.results;
        if (!marketDataResults) {
          console.error('Invalid market data response received');
          return;
        }
        marketDataMap = new Map<string, IOptionsMarketData>(
          marketDataResults.map(data => [data.instrument_id, data]),
        );
      }

      // Update observables: set positions and refresh market data in place.
      this._positions$.set(positionsMap, undefined);
      this._positionsMarketData.clear();
      marketDataMap.forEach((data, instrumentId) =>
        this._positionsMarketData.set(instrumentId, data),
      );
    } catch (error) {
      console.error('Failed to sync positions:', error);
    }
  }

  override dispose(): void {
    // Stop the timer
    this._timerService.stopTimer(this._traderId);

    this._orders$.get().forEach(order => order.dispose());
    super.dispose();
  }
}
