import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IObservable, observableValue } from 'vs/base/common/observable';
import { generateUuid } from 'vs/base/common/uuid';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
import { SortOrder, Pager } from '@shared/storage/dexie/dataAccessObject/Pager';
import { liveQuery, type Subscription } from 'dexie';
import { CalendarDataAccessObject } from './CalendarDataAccessObject';
import { CalendarValidator, CalendarValidationError } from './calendar.validator';
import { ICalendarEventModel, CalendarEventType, DaySelection } from './calendar.types';

const UPCOMING_EVENTS_PAGE_SIZE = 25;
const UPCOMING_EVENTS_SORT_INDEX: keyof ICalendarEventModel = 'eventTimestamp';

export interface ICalendarService extends IDisposable {
  readonly _serviceBrand: undefined;
  readonly upcomingEvents$: IObservable<ICalendarEventModel[]>;
  createEvent(
    eventData: Omit<ICalendarEventModel, 'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp'>,
  ): Promise<string>;
  getEvent(id: string): Promise<ICalendarEventModel | undefined>;
  updateEvent(
    id: string,
    updates: Partial<Omit<ICalendarEventModel, 'id' | 'retrievedTimestamp' | 'eventType'>>,
  ): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  listEvents(
    query?: Partial<Record<keyof ICalendarEventModel, unknown>>,
    options?: {
      pageSize?: number;
      sortOrder?: SortOrder;
      sortIndex?: keyof ICalendarEventModel;
    },
  ): Promise<ICalendarEventModel[]>;
  getEventsByDateRange(
    startTimestamp: number,
    endTimestamp: number,
    eventType?: CalendarEventType,
  ): Promise<ICalendarEventModel[]>;
  getTodaysEvents(eventType?: CalendarEventType): Promise<ICalendarEventModel[]>;
  getTomorrowsEvents(eventType?: CalendarEventType): Promise<ICalendarEventModel[]>;
  getEventByOriginalEventId(originalEventId: string): Promise<ICalendarEventModel | undefined>;
  getEventsForDayObservable(
    day: DaySelection,
    eventType?: CalendarEventType,
  ): IObservable<ICalendarEventModel[]>;
}

export const ICalendarService = createDecorator<ICalendarService>('calendarService');

export class CalendarService extends Disposable implements ICalendarService {
  public readonly _serviceBrand: undefined;
  private readonly _upcomingEventsValue$ = observableValue<ICalendarEventModel[]>(
    'upcomingCalendarEvents',
    [],
  );
  public readonly upcomingEvents$: IObservable<ICalendarEventModel[]> = this._upcomingEventsValue$;
  private _upcomingEventsSubscription: Subscription | undefined;
  private _dayObservables: Map<string, IObservable<ICalendarEventModel[]>> = new Map();

  public constructor(
    private readonly _logService: ILogService,
    private readonly _calendarDAO: CalendarDataAccessObject,
  ) {
    super();
    this._initializeUpcomingEventsObservable();
  }

  private _initializeUpcomingEventsObservable(): void {
    const now = Date.now();
    this._upcomingEventsSubscription = liveQuery(() =>
      this._calendarDAO.table
        .where(UPCOMING_EVENTS_SORT_INDEX)
        .aboveOrEqual(now)
        .limit(UPCOMING_EVENTS_PAGE_SIZE)
        .sortBy(UPCOMING_EVENTS_SORT_INDEX),
    ).subscribe({
      next: (result: ICalendarEventModel[]) => {
        this._upcomingEventsValue$.set(result, undefined);
        this._logService.trace(
          '[CalendarService] Upcoming events updated via liveQuery:',
          result.length,
        );
      },
      error: (error: unknown) => {
        this._logService.error('[CalendarService] Live query error for upcoming events:', error);
      },
    });

    this._register({
      dispose: () => {
        if (this._upcomingEventsSubscription) {
          this._upcomingEventsSubscription.unsubscribe();
          this._logService.trace('[CalendarService] Unsubscribed from upcoming events liveQuery.');
        }
      },
    });
  }

  public async createEvent(
    eventData: Omit<ICalendarEventModel, 'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp'>,
  ): Promise<string> {
    this._logService.trace('[CalendarService] Attempting to create event:', eventData);
    try {
      CalendarValidator.validate(eventData, true);
    } catch (error: unknown) {
      if (error instanceof CalendarValidationError) {
        this._logService.warn('[CalendarService] Validation failed for new event:', error.errors);
        throw error;
      }
      this._logService.error('[CalendarService] Unexpected error during validation:', error);
      throw new Error('An unexpected error occurred during event validation.');
    }

    const id = generateUuid();
    const now = Date.now();
    const calendarEvent: ICalendarEventModel = {
      ...(eventData as ICalendarEventModel),
      id,
      retrievedTimestamp: now,
      lastModifiedTimestamp: now,
    };

    if (calendarEvent.originalEventId) {
      const existing = await this.getEventByOriginalEventId(calendarEvent.originalEventId);
      if (existing) {
        this._logService.warn(
          `[CalendarService] Event with original ID ${calendarEvent.originalEventId} already exists with id ${existing.id}.`,
        );
        throw new Error(
          `Duplicate: Event with original ID '${calendarEvent.originalEventId}' already exists.`,
        );
      }
    }

    await this._calendarDAO.add(calendarEvent);
    this._logService.info(`[CalendarService] Event created with ID: ${id}`);
    return id;
  }

  public async getEvent(id: string): Promise<ICalendarEventModel | undefined> {
    this._logService.trace(`[CalendarService] Attempting to get event with ID: ${id}`);
    return this._calendarDAO.get(id);
  }

  public async getEventByOriginalEventId(
    originalEventId: string,
  ): Promise<ICalendarEventModel | undefined> {
    this._logService.trace(
      `[CalendarService] Attempting to get event by originalId: ${originalEventId}`,
    );
    return this._calendarDAO.findByOriginalEventId(originalEventId);
  }

  public async updateEvent(
    id: string,
    updates: Partial<Omit<ICalendarEventModel, 'id' | 'retrievedTimestamp' | 'eventType'>>,
  ): Promise<void> {
    this._logService.trace(`[CalendarService] Attempting to update event with ID: ${id}`, updates);
    const existingEvent = await this.getEvent(id);
    if (!existingEvent) {
      this._logService.warn(`[CalendarService] Event with ID ${id} not found for update.`);
      throw new Error(`Event with ID ${id} not found.`);
    }
    const eventDataForValidation = { ...updates, eventType: existingEvent.eventType };
    try {
      CalendarValidator.validate(eventDataForValidation, false);
    } catch (error: unknown) {
      if (error instanceof CalendarValidationError) {
        this._logService.warn(
          `[CalendarService] Validation failed for updating event ID ${id}:`,
          error.errors,
        );
        throw error;
      }
      this._logService.error(
        `[CalendarService] Unexpected error during validation for update ID ${id}:`,
        error,
      );
      throw new Error('An unexpected error occurred during event update validation.');
    }
    const validUpdates = {
      ...updates,
      lastModifiedTimestamp: Date.now(),
    };
    if (Object.keys(validUpdates).length === 1 && 'lastModifiedTimestamp' in validUpdates) {
      this._logService.info(
        `[CalendarService] No significant fields to update for event ID: ${id}, only updating timestamp.`,
      );
    }
    await this._calendarDAO.update(id, validUpdates);
    this._logService.info(`[CalendarService] Event updated with ID: ${id}`);
  }

  public async deleteEvent(id: string): Promise<void> {
    this._logService.trace(`[CalendarService] Attempting to delete event with ID: ${id}`);
    await this._calendarDAO.delete(id);
    this._logService.info(`[CalendarService] Event deleted with ID: ${id}`);
  }

  public async listEvents(
    query: Partial<Record<keyof ICalendarEventModel, unknown>> = {},
    options?: {
      pageSize?: number;
      sortOrder?: SortOrder;
      sortIndex?: keyof ICalendarEventModel;
    },
  ): Promise<ICalendarEventModel[]> {
    this._logService.trace(
      '[CalendarService] Listing events with query:',
      query,
      'options:',
      options,
    );
    const {
      pageSize = 20,
      sortOrder = SortOrder.ASC,
      sortIndex = 'eventTimestamp',
    } = options || {};
    const criterionFunction = (item: ICalendarEventModel): boolean => {
      const queryKeys = Object.keys(query) as (keyof ICalendarEventModel)[];
      return queryKeys.every(key => item[key] === query[key]);
    };
    const pager = new Pager<ICalendarEventModel, string>({
      table: this._calendarDAO.table,
      index: sortIndex as keyof ICalendarEventModel & string,
      idProp: 'id',
      criterionFunction: Object.keys(query).length > 0 ? criterionFunction : undefined,
      sortOrder,
      pageSize,
    });
    const page = await pager.nextPage();
    this._logService.trace(`[CalendarService] Found ${page.length} events.`);
    return page;
  }

  public async getEventsByDateRange(
    startTimestamp: number,
    endTimestamp: number,
    eventType?: CalendarEventType,
  ): Promise<ICalendarEventModel[]> {
    this._logService.trace(
      `[CalendarService] Getting events by date range: ${new Date(
        startTimestamp,
      ).toISOString()} - ${new Date(endTimestamp).toISOString()}, type: ${eventType || 'all'}`,
    );
    return this._calendarDAO.findEventsByDateRange(startTimestamp, endTimestamp, eventType);
  }

  public async getTodaysEvents(eventType?: CalendarEventType): Promise<ICalendarEventModel[]> {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    this._logService.trace(`[CalendarService] Getting today's events, type: ${eventType || 'all'}`);
    return this.getEventsByDateRange(startOfToday, endOfToday, eventType);
  }

  public async getTomorrowsEvents(eventType?: CalendarEventType): Promise<ICalendarEventModel[]> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    const endOfTomorrow = new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    this._logService.trace(
      `[CalendarService] Getting tomorrow's events, type: ${eventType || 'all'}`,
    );
    return this.getEventsByDateRange(startOfTomorrow, endOfTomorrow, eventType);
  }

  public getEventsForDayObservable(
    day: DaySelection,
    eventType?: CalendarEventType,
  ): IObservable<ICalendarEventModel[]> {
    const cacheKey = `${day}-${eventType || 'all'}`;
    if (this._dayObservables.has(cacheKey)) {
      return this._dayObservables.get(cacheKey)!;
    }
    const value$ = observableValue<ICalendarEventModel[]>(
      `calendarEvents-${day}-${eventType || 'all'}`,
      [],
    );
    const subscription = liveQuery(() => {
      const targetDate = new Date();
      if (day === DaySelection.TOMORROW) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      const startOfDay = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        0,
        0,
        0,
        0,
      ).getTime();
      const endOfDay = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();
      let query = this._calendarDAO.table
        .where('eventTimestamp')
        .between(startOfDay, endOfDay, true, true);
      if (eventType) {
        query = query.and((item: ICalendarEventModel) => item.eventType === eventType);
      }
      return query.sortBy('eventTimestamp');
    }).subscribe({
      next: (result: ICalendarEventModel[]) => {
        value$.set(result, undefined);
      },
      error: (error: unknown) => {
        this._logService.error(`[CalendarService] Live query error for ${day} events:`, error);
        value$.set([], undefined);
      },
    });
    this._register({
      dispose: () => subscription.unsubscribe(),
    });
    this._dayObservables.set(cacheKey, value$);
    return value$;
  }
}
