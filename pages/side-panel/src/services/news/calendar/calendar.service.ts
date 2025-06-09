import { Disposable, type IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITabService, TabService } from '../../utils/TabService';
import { ScriptInjectorService, IScriptInjectorService } from '../../utils/ScriptInjectorService';

export const ICalendarService = createDecorator<ICalendarService>('calendarService');

/**
 * Base interface for calendar services.
 * Defines the common contract for all calendar service implementations.
 */
export interface ICalendarService extends IDisposable {
  readonly _serviceBrand: undefined;
  // Future common methods for all calendar services can be added here.
}

/**
 * Base class for calendar services.
 * Provides shared dependencies like TabService and ScriptInjectorService,
 * and common functionalities for fetching and processing calendar data.
 */
export class CalendarService extends Disposable implements ICalendarService {
  public readonly _serviceBrand: undefined;

  protected readonly _tabService: ITabService;
  protected readonly _scriptInjectorService: IScriptInjectorService;

  public constructor() {
    super();
    // These services are instantiated here. If a dependency injection container
    // were available at this layer, they would typically be injected.
    this._tabService = new TabService();
    this._scriptInjectorService = new ScriptInjectorService();
  }

  public override dispose(): void {
    super.dispose();
    // If _tabService or _scriptInjectorService implement IDisposable and are
    // exclusively managed by this instance, they should be disposed here.
    // Example:
    // if (this._tabService && typeof (this._tabService as IDisposable).dispose === 'function') {
    //   (this._tabService as IDisposable).dispose();
    // }
    // if (this._scriptInjectorService && typeof (this._scriptInjectorService as IDisposable).dispose === 'function') {
    //   (this._scriptInjectorService as IDisposable).dispose();
    // }
  }
}
