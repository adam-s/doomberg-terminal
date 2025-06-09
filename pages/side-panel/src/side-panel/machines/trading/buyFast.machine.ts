import { IRequestService } from '@shared/services/request.service';
import {
  IOptionsInstrument,
  IOptionsOrderReviewPayload,
  IOptionsOrderCollateralResponse,
  IOptionsOrderResponse,
} from '@shared/services/request.types';
import { assign, fromPromise, setup, type ErrorActorEvent } from 'xstate';
import { generateUuid } from 'vs/base/common/uuid';

// Add assertion function at the top
function assertValidInput(
  input: Partial<TradingOperationInput>,
): asserts input is Required<TradingOperationInput> {
  if (!input.order || !input.requestService) {
    throw new Error('Invalid input: missing required properties');
  }
}

export type ContractType = 'CALL' | 'PUT';

export interface Order {
  quantity: number;
  stock: string;
  contractType: ContractType;
}

export interface TargetOptionOutput {
  targetOption: IOptionsInstrument;
}

export interface OptionQuote {
  ask_price: string;
  ask_size: number;
  bid_price: string;
  bid_size: number;
  open_interest: number;
}

export interface LegMetadata {
  option_quote: OptionQuote;
}

export interface OrderLeg {
  option: string;
  position_effect: string;
  ratio_quantity: number;
  side: string;
  leg_metadata: LegMetadata;
  option_id: string;
}

export interface FetchPayloadOutput {
  payload: IOptionsOrderReviewPayload;
}

// Base interface for common properties
export interface TradingOperationInput {
  order?: Order;
  requestService?: IRequestService;
  targetOption?: IOptionsInstrument;
  payload?: IOptionsOrderReviewPayload;
  orderResponse?: IOptionsOrderResponse;
}

// Specific interface extending the base
export interface BuyFastInput extends Partial<TradingOperationInput> {
  order?: Order;
  requestService: IRequestService;
  refreshOptionsOrders: () => Promise<void>;
}

export type BuyFastEvent =
  | ({
      type: 'BUY';
    } & Order)
  | ErrorActorEvent
  | {
      type: 'xstate.done.actor.findTargetOption';
      output: TargetOptionOutput;
    }
  | {
      type: 'xstate.done.actor.fetchPayload';
      output: FetchPayloadOutput;
    }
  | { type: 'xstate.done.actor.order'; output: OrderOutput };

export interface BuyFastContext {
  order?: Order;
  requestService: IRequestService;
  error?: unknown;
  targetOption?: IOptionsInstrument;
  payload?: IOptionsOrderReviewPayload;
  orderResponse?: IOptionsOrderResponse;
  refreshOptionsOrders: () => Promise<void>;
}

const findTargetOptionsActor = fromPromise<TargetOptionOutput, TradingOperationInput>(
  async ({ input }) => {
    assertValidInput(input);

    const requestService = input.requestService;
    const symbol = input.order.stock;
    const type = input.order.contractType.toLowerCase() as 'call' | 'put';

    const response = await requestService.fetchActiveInstruments(symbol);
    const instrument = response.results[0];
    if (!instrument) throw new Error(`Instrument not found for ${symbol}`);
    const quoteResponse = await requestService.fetchMarketDataQuotes(instrument.id);

    const quote = quoteResponse.results[0];
    if (!quote) throw new Error(`Quote not found for ${symbol}`);
    const bidPrice = parseFloat(quote.bid_price);
    const chainsResponse = await requestService.fetchOptionsChains(symbol);
    if (!chainsResponse.results.length) throw new Error(`No chains found for ${symbol}`);
    const chain = chainsResponse.results[0];
    const chainId = chain.id;
    const expirationDate = chain.expiration_dates[0];

    // Get all instruments directly using the pagination service
    const allInstruments = await requestService.fetchAllOptionsInstruments(
      chainId,
      expirationDate,
      type,
    );

    if (!allInstruments.length) throw new Error(`No options found for ${symbol}`);

    // Function to determine if option is out of money
    const isOutOfMoney = (strikePrice: number, currentPrice: number): boolean => {
      if (type === 'call') {
        return strikePrice > currentPrice;
      }
      return strikePrice < currentPrice;
    };

    // Find the closest out-of-money option
    let targetOption = null;
    let smallestDiff = Infinity;

    for (const option of allInstruments) {
      const strikePrice = parseFloat(option.strike_price);

      if (isOutOfMoney(strikePrice, bidPrice)) {
        const diff = Math.abs(strikePrice - bidPrice);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          targetOption = option;
        }
      }
    }

    if (!targetOption) {
      throw new Error(`No suitable ${type} options found near price ${bidPrice}`);
    }

    return { targetOption };
  },
);

const fetchPayloadActor = fromPromise<FetchPayloadOutput, TradingOperationInput>(
  async ({ input }) => {
    assertValidInput(input);
    const requestService = input.requestService;

    if (!input.targetOption) {
      throw new Error('Target option is required');
    }

    // Fetch accounts and options data in parallel
    const [accountsData, optionsData] = await Promise.all([
      requestService.fetchAccounts(true),
      requestService.fetchOptionsMarketData([input.targetOption.id]),
    ]);

    const account = accountsData.results[0];
    const optionsQuote = optionsData.results[0];

    if (!account || !optionsQuote) {
      throw new Error('Failed to fetch account or options data');
    }

    const payload: FetchPayloadOutput['payload'] = {
      account: account.url,
      check_overrides: [] as const, // Use const assertion to ensure empty array type
      client_ask_at_submission: optionsQuote.ask_price,
      client_bid_at_submission: optionsQuote.bid_price,
      direction: 'debit',
      form_source: 'option_chain',
      legs: [
        {
          option: optionsQuote.instrument,
          position_effect: 'open',
          ratio_quantity: 1,
          side: 'buy',
          leg_metadata: {
            option_quote: {
              ask_price: optionsQuote.ask_price,
              ask_size: optionsQuote.ask_size,
              bid_price: optionsQuote.bid_price,
              bid_size: optionsQuote.bid_size,
              open_interest: optionsQuote.open_interest,
            },
          },
          option_id: optionsQuote.instrument_id,
        },
      ],
      override_day_trade_checks: false,
      price: optionsQuote.ask_price,
      quantity: input.order.quantity.toString(),
      ref_id: generateUuid(),
      time_in_force: 'gfd',
      trigger: 'immediate',
      type: 'limit',
      metadata: {
        brokerage_account_type: account.brokerage_account_type,
        is_direction_explicit: true,
        number_of_accounts: 1,
        number_of_checks_seen: 0,
        options_buying_power: account.buying_power,
      },
    };

    return { payload };
  },
);

export interface ReviewOutput {
  alert: string | null;
}

const reviewActor = fromPromise<ReviewOutput, TradingOperationInput>(async ({ input }) => {
  assertValidInput(input);
  if (!input.payload) {
    throw new Error('Payload is required');
  }
  const requestService = input.requestService;
  const response = await requestService.reviewOptionsOrder(input.payload);
  return response;
});

export interface CollateralOutput {
  collateral: IOptionsOrderCollateralResponse;
}

const collateralActor = fromPromise<CollateralOutput, TradingOperationInput>(async ({ input }) => {
  assertValidInput(input);
  if (!input.payload) {
    throw new Error('Payload is required');
  }
  const requestService = input.requestService;
  const response = await requestService.fetchOptionsOrderCollateral(input.payload);
  return { collateral: response };
});

export interface OrderOutput {
  orderResponse: IOptionsOrderResponse;
}

const orderActor = fromPromise<OrderOutput, TradingOperationInput>(async ({ input }) => {
  assertValidInput(input);
  if (!input.payload) {
    throw new Error('Payload is required');
  }
  const requestService = input.requestService;
  const response = await requestService.createOptionsOrder(input.payload);
  return { orderResponse: response };
});

const ensureFilledActor = fromPromise<IOptionsOrderResponse, TradingOperationInput>(
  async ({ input }) => {
    assertValidInput(input);
    if (!input.orderResponse) {
      throw new Error('Order response is required');
    }

    const requestService = input.requestService;
    const maxAttempts = 10;
    const delayMs = 500;

    for (let i = 0; i < maxAttempts; i++) {
      const response = await requestService.fetchOptionsOrder(input.orderResponse.id);

      if (response.state === 'filled') {
        return response; // Return the response directly, not wrapped in an object
      }
      if (response.state === 'cancelled') {
        throw new Error('Order was cancelled');
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    requestService.cancelOptionsOrder(input.orderResponse.id);
    throw new Error('Order failed to fill within timeout');
  },
);

export const buyFastMachine = setup({
  types: {
    context: {} as BuyFastContext,
    events: {} as BuyFastEvent,
    input: {} as BuyFastInput,
  },
  actors: {
    findTargetOption: findTargetOptionsActor,
    fetchPayload: fetchPayloadActor,
    review: reviewActor,
    collateral: collateralActor,
    order: orderActor,
    ensureFilled: ensureFilledActor,
  },
  actions: {
    setError: assign({
      error: ({ event }) => {
        if ('error' in event) {
          return event.error;
        }
        return undefined;
      },
    }),
    clearError: assign({
      error: undefined,
    }),
    clearOrder: assign({
      orderResponse: undefined,
    }),
    assignOrderResponse: assign({
      orderResponse: ({ event }) =>
        (event as { type: 'xstate.done.actor.order'; output: OrderOutput }).output.orderResponse,
    }),
    callRefreshOptionsOrders: ({ context }) => {
      context.refreshOptionsOrders?.();
    },
  },
  guards: {
    isOrderFilled: ({ context }) => context.orderResponse?.state === 'filled',
    isOrderCancelled: ({ context }) => context.orderResponse?.state === 'cancelled',
  },
}).createMachine({
  id: 'buyFast',
  initial: 'idle',
  context: ({ input }) => ({
    order: undefined,
    requestService: input.requestService,
    payload: undefined,
    orderResponse: undefined,
    refreshOptionsOrders: input.refreshOptionsOrders,
  }),
  states: {
    idle: {
      on: {
        BUY: 'buying',
      },
    },
    buying: {
      initial: 'findTargetOption',
      entry: assign({
        order: ({ event }) =>
          event.type === 'BUY'
            ? {
                quantity: event.quantity,
                stock: event.stock,
                contractType: event.contractType,
              }
            : undefined,
      }),
      on: {},
      states: {
        findTargetOption: {
          meta: { info: 'Finding target option' },
          invoke: {
            id: 'findTargetOption',
            src: 'findTargetOption',
            input: ({ context }) => context,
            onDone: 'fetchPayload',
            onError: 'fail',
          },
        },
        fetchPayload: {
          meta: { info: 'Fetching payload' },
          invoke: {
            id: 'fetchPayload',
            input: ({ context, event }) => ({
              ...context,
              targetOption: (event as { output: TargetOptionOutput }).output.targetOption,
            }),
            src: 'fetchPayload',
            onDone: {
              target: 'review',
              actions: assign({
                payload: ({ event }) => (event as { output: FetchPayloadOutput }).output.payload,
              }),
            },
            onError: 'fail',
          },
        },
        review: {
          meta: { info: 'Reviewing order' },
          invoke: {
            id: 'review',
            input: ({ context }) => context,
            src: 'review',
            onDone: 'collateral',
            onError: 'fail',
          },
        },
        collateral: {
          meta: { info: 'Checking collateral' },
          invoke: {
            id: 'collateral',
            src: 'collateral',
            input: ({ context }) => context,
            onDone: 'order',
            onError: 'fail',
          },
        },
        order: {
          meta: { info: 'Placing order' },
          invoke: {
            id: 'order',
            src: 'order',
            input: ({ context }) => context,
            onDone: 'success',
            onError: 'fail',
          },
        },
        success: {
          entry: ['clearOrder', 'callRefreshOptionsOrders'],
          always: '#buyFast.idle',
        },
        fail: {
          entry: ['setError', 'clearOrder'],
          exit: 'clearError',
          after: {
            5000: '#buyFast.idle',
          },
        },
      },
    },
  },
});
