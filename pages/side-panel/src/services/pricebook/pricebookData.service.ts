import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IObservable, observableValue, transaction, derived } from 'vs/base/common/observable';
import { IRequestService } from '@shared/services/request.service';
import { IPricebookSnapshotResponse } from '@shared/services/request.types';
import { MarketHours } from '../marketHours';
import { ITimerService } from '@src/services/timer.service';

interface IPricebookDataServiceConfig {
  updateInterval?: number;
  historyPeriod?: number;
  bidAskSize?: number;
}

// Default configuration for the service.
const DEFAULT_CONFIG: Required<IPricebookDataServiceConfig> = {
  updateInterval: 1000,
  historyPeriod: 120,
  bidAskSize: 100,
};

export interface SimplifiedPricebookSnapshot {
  asks: Array<{ price: number; quantity: number }>;
  bids: Array<{ price: number; quantity: number }>;
}

export interface IPricebookDataService extends Disposable {
  readonly currentSnapshot$: IObservable<IPricebookSnapshotResponse | undefined>;
  readonly snapshotHistory$: IObservable<IPricebookSnapshotResponse[]>;
  readonly formattedPricebookHistory$: IObservable<SimplifiedPricebookSnapshot[]>; // renamed observable
  start(): Promise<void>;
  stop(): void;
}

/**
 * Service responsible for fetching and maintaining pricebook snapshots.
 *
 * It periodically fetches new snapshots from the server and updates both the current snapshot
 * and the historical snapshots (up to a configurable length).
 */
export class PricebookDataService extends Disposable implements IPricebookDataService {
  private readonly config: Required<IPricebookDataServiceConfig>;
  private readonly _updateTimerId: string;
  private readonly _marketCheckTimerId: string;
  private snapshotCache: IPricebookSnapshotResponse[] = [];
  private _cachedInstrumentId?: string;

  // Observables for the current snapshot and snapshot history.
  private readonly _pricebook$ = observableValue<IPricebookSnapshotResponse | undefined>(
    'currentSnapshot',
    undefined,
  );
  public readonly currentSnapshot$ = this._pricebook$;

  private readonly _pricebookHistory$ = observableValue<IPricebookSnapshotResponse[]>(
    'snapshotHistory',
    [],
  );
  public readonly snapshotHistory$ = this._pricebookHistory$;

  public readonly formattedPricebookHistory$ = derived(reader => {
    // renamed observable
    const history = this._pricebookHistory$.read(reader);
    const recentHistory = history.slice(-this.config.historyPeriod);

    return recentHistory.map(snapshot => ({
      asks: snapshot.asks.slice(0, this.config.bidAskSize).map(ask => ({
        price: Number(ask.price.amount),
        quantity: ask.quantity,
      })),
      bids: snapshot.bids.slice(0, this.config.bidAskSize).map(bid => ({
        price: Number(bid.price.amount),
        quantity: bid.quantity,
      })),
    }));
  });

  constructor(
    readonly symbol: string,
    config: IPricebookDataServiceConfig,
    @IRequestService private readonly requestService: IRequestService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @ITimerService private readonly timerService: ITimerService,
  ) {
    super();
    // Merge defaults with user configuration.
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._updateTimerId = `pricebook-update-${this.symbol}`;
    this._marketCheckTimerId = `pricebook-market-check-${this.symbol}`;
  }

  private async getActiveInstrument(): Promise<string> {
    if (this._cachedInstrumentId) return this._cachedInstrumentId;

    const response = await this.requestService.fetchActiveInstruments(this.symbol);
    const instrument = response.results[0];
    if (!instrument) {
      throw new Error(`Instrument not found for ${this.symbol}`);
    }

    this._cachedInstrumentId = instrument.id;
    return instrument.id;
  }

  /**
   * Trims the snapshot cache to the configured history period.
   */
  private trimSnapshotCache(): void {
    if (this.snapshotCache.length > this.config.historyPeriod) {
      this.snapshotCache = this.snapshotCache.slice(-this.config.historyPeriod);
    }
  }

  /**
   * Fetches the latest pricebook snapshot and updates the observables within a transaction.
   */
  private async updatePricebook(): Promise<void> {
    if (!MarketHours.isMarketOpen()) {
      this.stop();
      this.scheduleNextMarketOpen();
      return;
    }

    try {
      const instrumentId = await this.getActiveInstrument();
      const snapshot = await this.requestService.fetchPricebookSnapshot(instrumentId);

      if (!snapshot) {
        console.warn(`No pricebook data received for symbol ${this.symbol}`);
        return;
      }

      transaction(
        tx => {
          // Update current snapshot.
          this._pricebook$.set(snapshot, tx);

          // Update snapshot history with size limit.
          this.snapshotCache.push(snapshot);
          this.trimSnapshotCache();
          this._pricebookHistory$.set([...this.snapshotCache], tx);
        },
        () => `Updating pricebook for ${this.symbol}`,
      );
    } catch (error) {
      console.error(`Failed to update pricebook for symbol ${this.symbol}:`, error);
    }
  }

  private scheduleNextMarketOpen(): void {
    const nextOpen = MarketHours.getNextMarketOpen();
    const delay = nextOpen.getTime() - Date.now();

    // Use timer service with a one-time callback
    this.timerService.createTimer(this._marketCheckTimerId, delay);
    this._register(
      this.timerService.subscribeToTimer(this._marketCheckTimerId, delay, () => {
        this.start();
      }),
    );
  }

  /**
   * Starts the periodic update of the pricebook.
   */
  public async start(): Promise<void> {
    this.stop(); // Clear any existing timers

    if (!MarketHours.isMarketOpen()) {
      this.scheduleNextMarketOpen();
      return;
    }

    // Immediately update once.
    await this.updatePricebook();

    // Set up periodic updates using the timer service
    this._register(
      this.timerService.subscribeToTimer(this._updateTimerId, this.config.updateInterval, () =>
        this.updatePricebook(),
      ),
    );
  }

  /**
   * Stops the periodic update of the pricebook.
   */
  public stop(): void {
    this.timerService.stopTimer(this._updateTimerId);
    this.timerService.stopTimer(this._marketCheckTimerId);
  }

  override dispose(): void {
    this.stop();
    super.dispose();
  }
}
