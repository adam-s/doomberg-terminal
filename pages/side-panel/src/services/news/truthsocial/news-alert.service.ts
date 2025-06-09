import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, observableValue } from 'vs/base/common/observable';
import { ITruthSocialService } from './truth-social.service';

export const INewsAlertService = createDecorator<INewsAlertService>('newsAlertService');

export interface INewsAlertService extends Disposable {
  readonly _serviceBrand: undefined;
  readonly unreadNewsCount$: IObservable<number>;
  resetUnreadNewsCount(): void;
  setCurrentPageChecker(isOnNewsPage: () => boolean): void;
}

export class NewsAlertService extends Disposable implements INewsAlertService {
  declare readonly _serviceBrand: undefined;

  private readonly _unreadNewsCount$ = observableValue<number>('unreadNewsCount', 0);
  public readonly unreadNewsCount$: IObservable<number> = this._unreadNewsCount$;
  private _isOnNewsPage: (() => boolean) | undefined;

  constructor(private readonly _truthSocialService: ITruthSocialService) {
    super();
    this._register(
      this._truthSocialService.onStatusProcessed(() => {
        // Only increment if user is not currently on the news page
        if (!this._isOnNewsPage || !this._isOnNewsPage()) {
          this._unreadNewsCount$.set(this._unreadNewsCount$.get() + 1, undefined);
        }
      }),
    );
  }

  public setCurrentPageChecker(isOnNewsPage: () => boolean): void {
    this._isOnNewsPage = isOnNewsPage;
  }

  public resetUnreadNewsCount(): void {
    if (this._unreadNewsCount$.get() === 0) {
      return;
    }
    this._unreadNewsCount$.set(0, undefined);
  }
}
