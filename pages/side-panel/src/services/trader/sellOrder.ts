import { IRequestService } from '@shared/services/request.service';
import { Order, State } from './order';
import { OrderDetails, type SellOrderDetails } from './types';
import {
  IOptionsOrderReviewPayload,
  IOptionsOrderResponse,
  OrderState,
} from '@shared/services/request.types';
import { generateUuid } from 'vs/base/common/uuid';

export class SellOrder extends Order {
  constructor(
    orderDetails: SellOrderDetails,
    @IRequestService private readonly requestService: IRequestService,
  ) {
    super(orderDetails);
  }

  public async processOrder(): Promise<void> {
    try {
      this.updateState(State.Processing);
      const reviewPayload = await this.executeOrderReview();
      await this.handleOrderCreation(reviewPayload);
      await this.handleOrderResponse();
      console.log('Order processing complete.');
    } catch (error) {
      this.handleError(error);
    }
  }

  private async executeOrderReview(): Promise<IOptionsOrderReviewPayload> {
    const reviewPayload = await this.buildOrderReviewPayload();
    await this.submitOrderReview(reviewPayload);
    await this.validateOrderReview(reviewPayload);
    this.updateState(State.Submitted);
    return reviewPayload;
  }

  private async handleOrderCreation(reviewPayload: IOptionsOrderReviewPayload): Promise<void> {
    const orderResponse = await this.createOptionsOrder(reviewPayload);
    this.orderResponse = orderResponse;
    this.updateState(State.AwaitingFulfillment);
  }

  private async handleOrderResponse(): Promise<void> {
    if (this.isOrderFilled()) {
      this.updateState(State.Done);
    } else {
      await this.pollOrderStatus();

      if (!this.isOrderFilled() && this.id) {
        await this.cancelAndMonitorOrder();
      }
    }
  }

  private async cancelAndMonitorOrder(): Promise<void> {
    await this.requestService.cancelOptionsOrder(this.id as string);
    this.updateState(State.Cancelling);
    await this.pollOrderStatus();

    if (this.isOrderCancelled()) {
      this.updateState(State.Cancelled);
    }
  }

  private isOrderFilled(): boolean {
    return this.derivedState === OrderState.Filled;
  }

  private isOrderCancelled(): boolean {
    return this.derivedState === OrderState.Cancelled;
  }

  private isOrderComplete(state: OrderState): boolean {
    return state === OrderState.Filled || state === OrderState.Cancelled;
  }

  private handleError(error: unknown): never {
    this.updateState(State.Error);
    console.error('Error processing order requests:', error);
    throw error;
  }

  private async pollOrderStatus(): Promise<void> {
    const maxAttempts = 5;
    const pollInterval = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const order = await this.requestService.fetchSingleOptionsOrder(this.id as string);
        this.orderResponse = order;

        if (this.isOrderComplete(order.derived_state)) {
          break;
        }
      } catch (error) {
        console.error(`Failed to fetch order status (attempt ${attempt + 1}):`, error);
      }
    }
  }

  private async buildOrderReviewPayload(): Promise<IOptionsOrderReviewPayload> {
    const [accountsData, optionsData] = await Promise.all([
      this.requestService.fetchAccounts(true),
      this.requestService.fetchOptionsMarketData([this.instrumentId]),
    ]);

    const account = accountsData.results[0];
    const optionQuote = optionsData.results[0];

    if (!account || !optionQuote) {
      throw new Error('Failed to fetch account or options data');
    }

    const price = `${(parseFloat(optionQuote.bid_price) - (this.fast ? 0.1 : 0)).toFixed(2)}`;
    const finalPrice = Math.max(0.01, parseFloat(price)).toFixed(2);

    return {
      account: account.url,
      check_overrides: [],
      client_ask_at_submission: optionQuote.ask_price,
      client_bid_at_submission: optionQuote.bid_price,
      direction: 'credit',
      form_source: 'strategy_detail',
      legs: [
        {
          option: optionQuote.instrument,
          position_effect: 'close',
          ratio_quantity: 1,
          side: 'sell',
          leg_metadata: {
            option_quote: {
              ask_price: optionQuote.ask_price,
              ask_size: optionQuote.ask_size,
              bid_price: optionQuote.bid_price,
              bid_size: optionQuote.bid_size,
              open_interest: optionQuote.open_interest,
            },
          },
          option_id: optionQuote.instrument_id,
        },
      ],
      override_day_trade_checks: false,
      price: finalPrice,
      quantity: this.quantity.toString(),
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
  }

  private async submitOrderReview(payload: IOptionsOrderReviewPayload): Promise<void> {
    const response = await this.requestService.reviewOptionsOrder(payload);
    if (response.alert !== null) {
      throw new Error(`Failed to submit order review: ${response.alert}`);
    }
  }

  private async validateOrderReview(payload: IOptionsOrderReviewPayload): Promise<void> {
    const response = await this.requestService.reviewOptionsOrder(payload);
    if (response.alert !== null) {
      throw new Error(`Failed to submit order review: ${response.alert}`);
    }
  }

  private async createOptionsOrder(
    payload: IOptionsOrderReviewPayload,
  ): Promise<IOptionsOrderResponse> {
    const response = await this.requestService.createOptionsOrder(payload);
    if (!response) {
      throw new Error(`Failed to create options order`);
    }
    return response;
  }
}

export type { OrderDetails };
