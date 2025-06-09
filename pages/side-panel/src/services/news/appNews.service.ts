import { Disposable } from 'vs/base/common/lifecycle';
import {
  IInstantiationService,
  createDecorator,
} from 'vs/platform/instantiation/common/instantiation';
import { ITruthSocialService, TruthSocialService } from './truthsocial/truth-social.service';
import { INewsService } from '@shared/features/news/news.service';
import { IObservable } from 'vs/base/common/observable';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject';
import {
  IEarningsCalendarService,
  EarningsCalendarService,
} from './calendar/earnings-calendar.service';
import {
  IEconomicCalendarService,
  EconomicCalendarService,
} from './calendar/economic-calendar.service';
import { ILogService } from '@shared/services/log.service'; // Ensure ILogService is imported
import { formatDate } from '../utils/commonUtils'; // Import formatDate
import {
  ICalendarPollingService,
  CalendarPollingService,
} from './calendar/calendar-polling.service';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EconomicCalendarPolling } from './calendar/economic-calendar-polling'; // + Import the new poller
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { INewsAlertService, NewsAlertService } from './truthsocial/news-alert.service';

export interface IAppNewsService {
  readonly _serviceBrand: undefined;
  getTruthSocialService(): ITruthSocialService;
  getEarningsCalendarService(): IEarningsCalendarService;
  getEconomicCalendarService(): IEconomicCalendarService;
  getNewsAlertService(): INewsAlertService;
  getLatestNewsObservable(): IObservable<INewsItemModel[] | undefined>;
}

export const IAppNewsService = createDecorator<IAppNewsService>('appNewsService');

export class AppNewsService extends Disposable implements IAppNewsService {
  declare public readonly _serviceBrand: undefined;
  private readonly _earningsCalendarService: IEarningsCalendarService;
  private readonly _economicCalendarService: IEconomicCalendarService;
  private readonly _truthSocialService: ITruthSocialService;
  private readonly _calendarPollingService: ICalendarPollingService;
  private readonly _economicCalendarPolling: EconomicCalendarPolling; // + Declare the new poller
  private readonly _newsAlertService: INewsAlertService;

  public constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
    @INewsService private _newsService: INewsService,
    @ILogService private readonly _logService: ILogService,
  ) {
    super();
    this._truthSocialService = this._instantiationService.createInstance(TruthSocialService);
    // Initialize EarningsCalendarService
    this._earningsCalendarService =
      this._instantiationService.createInstance(EarningsCalendarService);
    this._register(this._earningsCalendarService);

    // Initialize EconomicCalendarService
    this._economicCalendarService =
      this._instantiationService.createInstance(EconomicCalendarService);
    this._register(this._economicCalendarService);
    // Initialize the new EconomicCalendarPolling service
    this._economicCalendarPolling = this._instantiationService.createInstance(
      new SyncDescriptor(EconomicCalendarPolling, [this._economicCalendarService]),
    );
    this._register(this._economicCalendarPolling);

    this._calendarPollingService = this._instantiationService
      .createChild(
        new ServiceCollection(
          [IEconomicCalendarService, this._economicCalendarService],
          [IEarningsCalendarService, this._earningsCalendarService],
        ),
      )
      .createInstance(CalendarPollingService);
    // Initialize and start CalendarPollingService);
    this._register(this._calendarPollingService);
    // this._calendarPollingService.startPolling();

    // Initialize NewsAlertService
    this._newsAlertService = this._instantiationService.createInstance(
      new SyncDescriptor(NewsAlertService, [this._truthSocialService]),
    );
    this._register(this._newsAlertService);

    this._initialEconomicEventsSync().then(() => {
      // Start polling after initial sync is attempted
      this._economicCalendarPolling.startPolling();
    });
  }

  private async _initialEconomicEventsSync(): Promise<void> {
    // Synchronize economic events with database (one week of data)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 3); // Start 3 days ago
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 4); // End 4 days from now (total 7 days)

    const formattedStartDate = formatDate(startDate);
    const formattedEndDate = formatDate(endDate);

    this._economicCalendarService
      .synchronizeEconomicEventsWithDatabase(formattedStartDate, formattedEndDate)
      .then(() => {
        this._logService.info(
          `[AppNewsService] Initial synchronization of economic events with database for ${formattedStartDate} to ${formattedEndDate} completed.`,
        );
      })
      .catch((error: unknown) => {
        this._logService.error(
          '[AppNewsService] Error during initial synchronization of economic events with database:',
          error,
        );
      });
  }

  public getTruthSocialService(): ITruthSocialService {
    return this._truthSocialService;
  }

  public getEarningsCalendarService(): IEarningsCalendarService {
    return this._earningsCalendarService;
  }

  public getEconomicCalendarService(): IEconomicCalendarService {
    return this._economicCalendarService;
  }

  public getNewsAlertService(): INewsAlertService {
    return this._newsAlertService;
  }

  public getLatestNewsObservable(): IObservable<INewsItemModel[] | undefined> {
    return this._newsService.latestNews$;
  }

  public override dispose(): void {
    // The poller is already registered and will be disposed by super.dispose()
    super.dispose();
  }
}
