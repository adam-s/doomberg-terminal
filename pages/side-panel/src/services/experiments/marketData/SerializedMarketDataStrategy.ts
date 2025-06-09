import { Disposable } from 'vs/base/common/lifecycle';
import { IOptionsMarketData } from '@shared/services/request.types';
import { getSerializedMarketData } from '../intermediates/mockData/marketDataSerializer';
import { IMarketDataStrategy } from './IMarketDataStrategy';
import { observableValue } from 'vs/base/common/observable';

export class SerializedMarketDataStrategy extends Disposable implements IMarketDataStrategy {
  // -- Private State Observables ------------------------------------------
  private readonly _serializedData$ = observableValue<
    Array<Map<string, IOptionsMarketData | null>>
  >('serializedData', []);
  private readonly _currentIndex$ = observableValue<number>('currentIndex', 0);

  constructor() {
    super();
    this._initializeData();
  }

  // -- Public API Methods ------------------------------------------------
  public async fetchNextSnapshot(): Promise<Map<string, IOptionsMarketData | null>> {
    const data = this._serializedData$.get();
    if (!data.length) {
      return new Map();
    }

    const currentIndex = this._currentIndex$.get();
    const snapshot = data[currentIndex];

    this._currentIndex$.set((currentIndex + 1) % data.length, undefined);

    return snapshot;
  }

  public reset(): void {
    this._currentIndex$.set(0, undefined);
  }

  // -- Private Helper Methods --------------------------------------------
  private _initializeData(): void {
    try {
      const data = getSerializedMarketData();
      this._serializedData$.set(data, undefined);
    } catch (error) {
      console.error('Error initializing serialized market data:', error);
      this._serializedData$.set([], undefined);
    }
  }
}
