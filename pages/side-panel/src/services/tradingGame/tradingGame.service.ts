import { Disposable } from 'vs/base/common/lifecycle';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { observableValue, IObservable } from 'vs/base/common/observable';
import { Data, IData } from './data';
import { TradeManager } from './tradeManager';

export enum TradingGameServiceState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  ERROR = 'error',
}

export interface ITradingGameService {
  readonly _serviceBrand: undefined;
  readonly status$: IObservable<TradingGameServiceState>;
  readonly data: IData;
  readonly tradeManager: TradeManager;

  start(): Promise<void>;
}

export const ITradingGameService = createDecorator<ITradingGameService>('tradingGameService');

export class TradingGameService extends Disposable implements ITradingGameService {
  declare readonly _serviceBrand: undefined;

  private readonly _status$ = observableValue<TradingGameServiceState>(
    'tradingGameStatus',
    TradingGameServiceState.IDLE,
  );

  public readonly status$ = this._status$;

  public readonly data: IData;

  public readonly tradeManager: TradeManager;

  constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
  ) {
    super();

    this.data = this._register(this._instantiationService.createInstance(Data, ['SPY', 'QQQ']));

    this.tradeManager = this._register(
      this._instantiationService.createInstance(TradeManager, this.data),
    );
  }

  public async start(): Promise<void> {
    if (this._status$.get() !== TradingGameServiceState.IDLE) {
      console.warn('TradingGameService already started or starting.');
      return;
    }

    this._status$.set(TradingGameServiceState.INITIALIZING, undefined);

    try {
      // Add any async initialization if needed in the future
      console.log('TradingGameService starting...');

      // Potentially wait for data service readiness if required
      // await this.data.waitForReady(); // Example if Data had an init method

      this._status$.set(TradingGameServiceState.INITIALIZED, undefined);
      console.log('TradingGameService started successfully.');
    } catch (error) {
      console.error('TradingGameService failed to start:', error);
      this._status$.set(TradingGameServiceState.ERROR, undefined);
      throw error; // Re-throw to let callers handle the error
    }
  }

  override dispose(): void {
    console.log('Disposing TradingGameService...');
    super.dispose();
    console.log('TradingGameService disposed.');
  }
}
