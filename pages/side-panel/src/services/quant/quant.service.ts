import { Disposable } from 'vs/base/common/lifecycle';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { observableValue, IObservable } from 'vs/base/common/observable';
import { Settings } from './settings';
import { Data, IData } from './data';
import { TradeManager } from './tradeManager';

export enum QuantServiceState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  ERROR = 'error',
}

export interface IQuantService {
  readonly _serviceBrand: undefined;
  readonly status$: IObservable<QuantServiceState>;
  readonly settings: Settings;
  readonly data: IData;
  readonly tradeManager: TradeManager; // Updated property name for consistency

  start(): Promise<void>;
}

export const IQuantService = createDecorator<IQuantService>('quantService');

export class QuantService extends Disposable implements IQuantService {
  declare readonly _serviceBrand: undefined;

  private readonly _status$ = observableValue<QuantServiceState>(
    'quantStatus',
    QuantServiceState.IDLE,
  );

  public readonly settings: Settings;

  public readonly status$ = this._status$;

  public readonly data: IData;

  // Renamed from positionManager to tradeManager for terminology consistency
  public readonly tradeManager: TradeManager;

  constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
  ) {
    super();

    this.settings = this._register(new Settings());

    this.data = this._register(this._instantiationService.createInstance(Data, ['SPY', 'QQQ']));

    this.tradeManager = this._register(
      this._instantiationService.createInstance(TradeManager, this.data, this.settings),
    );
  }

  public async start(): Promise<void> {
    this._status$.set(QuantServiceState.INITIALIZING, undefined);

    // For the current simple implementation, we don't need try-catch yet
    console.log('QuantService started');
    this._status$.set(QuantServiceState.INITIALIZED, undefined);
  }

  override dispose(): void {
    super.dispose();
  }
}
