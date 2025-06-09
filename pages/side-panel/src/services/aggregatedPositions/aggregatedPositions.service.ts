import { IRequestService } from '@shared/services/request.service';
import {
  IOptionsAggregatedPositions,
  IOptionsMarketData,
  IOptionsOrder,
  IOptionsInstrument,
} from '@shared/services/request.types';
import { observableValue } from 'vs/base/common/observable';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITimerService } from '@src/services/timer.service';

export class AggregatedPositionsService extends Disposable {
  // Replace interval variables with timer IDs
  private readonly _positionsTimerId = 'aggregated-positions';
  private readonly _ordersTimerId = 'aggregated-orders';

  // Add new observable for orders polling interval (in milliseconds)
  public ordersPollInterval = observableValue<number>('ordersPollInterval', 2500);

  public positions = observableValue<IOptionsAggregatedPositions[]>('positions', []);
  public marketData = observableValue<IOptionsMarketData[]>('marketData', []);

  public optionsOrders = observableValue<IOptionsOrder[]>('optionsOrders', []);

  constructor(
    @IRequestService private readonly requestService: IRequestService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();
  }

  async start() {
    // Initial data fetch
    await this.fetchPositionsAndMarketData();
    await this.updateOrders();

    // Setup positions timer (fixed 5000ms interval) using consolidated timer subscription
    this._register(
      this.timerService.subscribeToTimer(this._positionsTimerId, 5000, () =>
        this.fetchPositionsAndMarketData().catch(console.error),
      ),
    );

    // Setup orders timer with dynamic interval using consolidated timer subscription
    this._register(
      this.timerService.subscribeToTimer(this._ordersTimerId, this.ordersPollInterval, () =>
        this.updateOrders().catch(console.error),
      ),
    );

    // No need for separate interval change autorun, as it's handled by subscribeToTimer
  }

  // Method to update the polling interval
  public setOrdersPollInterval(interval: number): void {
    console.log('Service: Setting orders poll interval to:', interval);
    this.ordersPollInterval.set(interval, undefined);
  }

  private async fetchPositionsAndMarketData(): Promise<void> {
    try {
      // Use the dedicated pagination method from RequestService

      const allPositions = await this.requestService.fetchAllOptionsAggregatedPositions(
        undefined,
        true,
        undefined,
      );
      this.positions.set(allPositions, undefined);

      // Then immediately fetch latest market data for these positions
      await this.updateMarketData();
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  }

  private async updateMarketData() {
    const positions = this.positions.get();
    if (!positions.length) return;

    const optionIds = positions
      .flatMap(position => position.legs.map(leg => leg.option_id))
      .join(',');

    const marketData = await this.requestService.fetchOptionsMarketData(optionIds);
    this.marketData.set(marketData.results, undefined, undefined);
  }

  private async updateOrders(): Promise<void> {
    try {
      const states = [
        'queued',
        'new',
        'confirmed',
        'unconfirmed',
        'partially_filled',
        'pending_cancelled',
      ].join(',');

      // Use the dedicated pagination method from RequestService
      const allOrders = await this.requestService.fetchAllOptionsOrders(undefined, states);
      this.optionsOrders.set(allOrders, undefined);
    } catch (error) {
      console.error('Error updating orders:', error);
    }
  }

  public async refreshOptionsOrders(): Promise<void> {
    await this.updateOrders();
  }

  // Helper method to fetch instruments using the non-recursive approach
  public async fetchInstruments(
    chainId: string,
    date: string,
    optionType: 'call' | 'put',
  ): Promise<IOptionsInstrument[]> {
    return this.requestService.fetchAllOptionsInstruments(chainId, date, optionType, 'active');
  }

  override dispose(): void {
    // Stop timers instead of clearing intervals
    this.timerService.stopTimer(this._positionsTimerId);
    this.timerService.stopTimer(this._ordersTimerId);
    super.dispose();
  }
}
