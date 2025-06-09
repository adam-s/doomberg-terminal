// order.ts
import { Disposable } from 'vs/base/common/lifecycle';
import { OrderDetails } from './types';
import { OptionsOrderDerivedState, IOptionsOrderResponse } from '@shared/services/request.types';

export const enum State {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Submitted = 'SUBMITTED',
  AwaitingFulfillment = 'AWAITING_FULFILLMENT',
  Cancelling = 'CANCELLING',
  Cancelled = 'CANCELLED',
  Done = 'DONE',
  Error = 'ERROR',
}

export abstract class Order extends Disposable implements PromiseLike<Order> {
  public readonly instrumentId: string;
  public readonly quantity: number;
  public readonly fast: boolean;
  public state: State = State.Pending;
  protected _orderResponse: IOptionsOrderResponse | undefined;

  constructor(orderDetails: OrderDetails) {
    super();
    this.instrumentId = orderDetails.id;
    this.quantity = orderDetails.quantity;
    this.fast = orderDetails.fast ?? false;
  }

  // Implement the PromiseLike interface
  public then<TResult1 = Order, TResult2 = never>(
    onfulfilled?: (value: Order) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this).then(onfulfilled, onrejected);
  }

  // Public getters for the private fields
  public get id(): string | null {
    return this._orderResponse?.id ?? null;
  }

  public get derivedState(): OptionsOrderDerivedState | null {
    return this._orderResponse?.derived_state ?? null;
  }

  public get orderResponse(): IOptionsOrderResponse | undefined {
    return this._orderResponse;
  }

  public set orderResponse(value: IOptionsOrderResponse | undefined) {
    this._orderResponse = value;
  }

  public updateState(newState: State): void {
    this.state = newState;
  }

  public complete(): void {
    this.updateState(State.Done);
  }

  public fail(): void {
    this.updateState(State.Error);
  }

  abstract processOrder(): Promise<void>;

  override dispose(): void {
    super.dispose();
  }
}
