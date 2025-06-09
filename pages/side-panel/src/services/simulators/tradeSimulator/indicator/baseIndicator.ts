import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export abstract class BaseIndicator<TEvent> extends Disposable {
  readonly _serviceBrand: undefined;

  protected readonly _indicatorValueEmitter = this._register(new Emitter<TEvent>());
  public readonly indicatorValue = this._indicatorValueEmitter.event;
}
