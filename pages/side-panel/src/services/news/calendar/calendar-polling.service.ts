import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event as VSEvent } from 'vs/base/common/event';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
// import { ICalendarService } from '@shared/features/calendar/calendar.service'; // Removed
import { ICalendarService as ISharedCalendarService } from '@shared/features/calendar/calendar.service';
import { INewsService as ISharedNewsService } from '@shared/features/news/news.service'; // Added
import type { ParsedEconomicEventData } from './economic-calendar-parser';
import { CalendarNewsAnalysis } from './calendar-news-analysis-structured';
import { PollingService, IPollingService } from '../../utils/polling';
import { getTodaysDateString } from '../../utils/commonUtils';
import { ServiceEvent } from '@src/side-panel/worker/utils/types';
import {
  ICalendarEventModel,
  CalendarEventType,
  IEconomicCalendarEvent,
} from '@shared/features/calendar/calendar.types';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject'; // Added

const POLL_INTERVAL_MS = 60000; // 1 minute

export interface ICalendarPollingService extends Disposable {
  readonly onProgress: VSEvent<ServiceEvent>;
  readonly onEventProcessed: VSEvent<ParsedEconomicEventData>;
  startPolling(): void;
  stopPolling(): void;
}

export const ICalendarPollingServiceDecorator =
  createDecorator<ICalendarPollingService>('calendarPollingService');

export class CalendarPollingService extends Disposable implements ICalendarPollingService {
  private readonly _onProgress = this._register(new Emitter<ServiceEvent>());
  public readonly onProgress: VSEvent<ServiceEvent> = this._onProgress.event;

  private readonly _onEventProcessed = this._register(new Emitter<ParsedEconomicEventData>());
  public readonly onEventProcessed: VSEvent<ParsedEconomicEventData> = this._onEventProcessed.event;

  private _processedEventIdsToday: Set<string> = new Set();
  private _currentDayString: string = '';
  private readonly _calendarAnalysis: CalendarNewsAnalysis;
  private readonly _pollingService: IPollingService;

  constructor(
    @ILogService private readonly _logService: ILogService,
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
    @ISharedCalendarService private readonly _sharedCalendarService: ISharedCalendarService,
    @ISharedNewsService private readonly _sharedNewsService: ISharedNewsService, // Added
  ) {
    super();
    this._logService.trace('[CalendarPollingService] initialized');
    this._calendarAnalysis = this._instantiationService.createInstance(CalendarNewsAnalysis);
    this._pollingService = this._register(
      new PollingService({
        pollIntervalMs: POLL_INTERVAL_MS,
        callback: () => this._pollAndProcessNextEvent(),
        onError: (
          err: unknown, // Ensure error is typed
        ) => this._logService.error('[CalendarPollingService] Polling callback error:', err),
        runImmediately: true,
        serviceName: 'CalendarPollingService',
      }),
    );
  }

  public startPolling(): void {
    this._logService.info('[CalendarPollingService] Starting polling.');
    this._pollingService.start();
  }

  public stopPolling(): void {
    this._logService.info('[CalendarPollingService] Stopping polling.');
    this._pollingService.stop();
  }

  private async _pollAndProcessNextEvent(): Promise<void> {
    const todayString = getTodaysDateString();

    if (this._currentDayString !== todayString) {
      this._logService.info(
        `[CalendarPollingService] New day detected. Old: ${this._currentDayString}, New: ${todayString}. Resetting processed event IDs.`,
      );
      this._currentDayString = todayString;
      this._processedEventIdsToday.clear();
    }

    let allDailyEvents: ICalendarEventModel[];
    try {
      const todayDate = new Date();
      const startOfTomorrow = new Date(
        todayDate.getFullYear(),
        todayDate.getMonth(),
        todayDate.getDate() + 1, // Get tomorrow's date
        0,
        0,
        0,
        0,
      ).getTime();
      const endOfTomorrow = new Date(
        todayDate.getFullYear(),
        todayDate.getMonth(),
        todayDate.getDate() + 1, // Get tomorrow's date
        23,
        59,
        59,
        999,
      ).getTime();

      // Fetch all types of events for tomorrow directly from the CalendarDataAccessObject
      allDailyEvents = await this._sharedCalendarService.getEventsByDateRange(
        startOfTomorrow,
        endOfTomorrow,
      );
      this._logService.info(
        `[CalendarPollingService] Fetched ${allDailyEvents.length} total events for ${this._currentDayString} directly from DAO.`,
      );
    } catch (error: unknown) {
      // Ensure error is typed
      this._logService.error(
        `[CalendarPollingService] Error fetching today's events from DAO for ${this._currentDayString}:`,
        error,
      );
      return;
    }

    const economicEventsToday = allDailyEvents.filter(
      event => event.eventType === CalendarEventType.ECONOMIC,
    ) as IEconomicCalendarEvent[];

    if (economicEventsToday.length === 0) {
      this._logService.info(
        `[CalendarPollingService] No economic events found for ${this._currentDayString} to process this cycle.`,
      );
      return;
    }

    const unprocessedEconomicEvents = [];
    for (const event of economicEventsToday) {
      if (event.originalEventId && !this._processedEventIdsToday.has(event.originalEventId)) {
        try {
          const existingNewsItem = await this._sharedNewsService.getNewsItemBySourceId(
            'EconomicCalendar',
            event.originalEventId,
          );
          if (existingNewsItem) {
            this._logService.info(
              `[CalendarPollingService] News item for event ${event.originalEventId} already exists. Marking as processed.`,
            );
            this._processedEventIdsToday.add(event.originalEventId);
          } else {
            unprocessedEconomicEvents.push(event);
          }
        } catch (dbError) {
          this._logService.warn(
            `[CalendarPollingService] Error checking DB for existing news item for event ${event.originalEventId}. Will attempt to process.`,
            dbError,
          );
          unprocessedEconomicEvents.push(event); // Add to process if DB check fails
        }
      }
    }

    if (unprocessedEconomicEvents.length === 0) {
      this._logService.info(
        `[CalendarPollingService] All economic events for ${this._currentDayString} have either been processed or are invalid. No new economic event to process this cycle.`,
      );
      return;
    }

    const randomIndex = Math.floor(Math.random() * unprocessedEconomicEvents.length);
    const eventToProcess = unprocessedEconomicEvents[randomIndex];

    if (eventToProcess && eventToProcess.originalEventId) {
      this._logService.info(
        `[CalendarPollingService] Randomly selected economic event ${eventToProcess.originalEventId} for analysis. ${unprocessedEconomicEvents.length} unprocessed economic events were available.`,
      );
      try {
        // Cast to ParsedEconomicEventData as analyzeEvent expects this type.
        // This assumes IEconomicCalendarEvent is compatible or can be safely cast.
        // If not, a proper mapping function would be needed here.
        const newsItemToCreate: Omit<INewsItemModel, 'id' | 'retrievedTimestamp'> =
          await this._calendarAnalysis.analyzeEvent(
            eventToProcess as unknown as ParsedEconomicEventData,
          );

        const newsItemId = await this._sharedNewsService.createNewsItem(newsItemToCreate);

        this._processedEventIdsToday.add(eventToProcess.originalEventId);
        // Ensure the event fired matches the type expected by listeners if it's strictly ParsedEconomicEventData
        this._onEventProcessed.fire(eventToProcess as unknown as ParsedEconomicEventData);
        this._logService.info(
          `[CalendarPollingService] Successfully analyzed event ${eventToProcess.originalEventId}, created news item ${newsItemId}. Title: "${newsItemToCreate.title}". ${unprocessedEconomicEvents.length - 1} unprocessed economic events remaining for ${this._currentDayString}.`,
        );
      } catch (error: unknown) {
        this._logService.error(
          `[CalendarPollingService] Error during analysis or DB creation for economic event ${eventToProcess.originalEventId}:`,
          error,
        );
      }
    } else {
      this._logService.warn(
        `[CalendarPollingService] Failed to select a valid economic event for processing from the unprocessed list. This indicates an unexpected issue.`,
      );
    }
  }

  public override dispose(): void {
    this.stopPolling();
    super.dispose();
    this._logService.info('[CalendarPollingService] Disposed.');
  }
}
