import { BaseDataAccessObject } from '@shared/storage/dexie/dataAccessObject/BaseDataAccessObject';
import { DatabasePlugin } from '@shared/storage/dexie/dataAccessObject/DatabasePlugin';
import { Dexie, type Table } from 'dexie';
import {
  ICalendarEventModel,
  IBaseCalendarEvent,
  CalendarEventType,
  EconomicImpactLevel,
  EarningsReportingTime,
} from './calendar.types';

const CALENDAR_EVENT_SCHEMA_DEFINITION = {
  1: 'id, eventTimestamp, eventType, country, eventDate, sourceProviderUrl, [eventType+eventTimestamp], &[sourceProvider+originalEventId], impactLevel, tickerSymbol, reportingTime, companyShortName, originalEventId', // Added originalEventId for indexing
};

export class CalendarDataAccessObject extends BaseDataAccessObject<ICalendarEventModel, string> {
  public constructor(db: Dexie) {
    super(db.table('calendarEvents'), 'calendarEvents');
  }

  public get table(): Table<ICalendarEventModel, string> {
    return this._table;
  }

  public async findByOriginalEventId(
    // Renamed and signature changed
    originalEventId: string,
  ): Promise<ICalendarEventModel | undefined> {
    if (!originalEventId) {
      return undefined;
    }
    // Query directly by originalEventId
    return this.table.where('originalEventId').equals(originalEventId).first();
  }

  public async findEventsByDateRange(
    startTimestamp: number,
    endTimestamp: number,
    eventType?: CalendarEventType,
  ): Promise<ICalendarEventModel[]> {
    let query = this.table
      .where('eventTimestamp')
      .between(startTimestamp, endTimestamp, true, true);
    if (eventType) {
      query = query.and(item => item.eventType === eventType);
    }
    return query.sortBy('eventTimestamp');
  }

  public static plugin: DatabasePlugin<ICalendarEventModel, string> = {
    tableName: 'calendarEvents',
    schema: CALENDAR_EVENT_SCHEMA_DEFINITION,
    modelClass: class CalendarEventModelImpl implements IBaseCalendarEvent {
      // Fields from IBaseCalendarEvent (required ones can keep '!' if Dexie guarantees them)
      public id!: string;
      public eventType!: CalendarEventType;
      public eventDate!: string;
      public eventTimestamp!: number;
      public country!: string;
      public sourceProvider?: string;
      public sourceProviderUrl?: string; // Added sourceProviderUrl
      public originalEventId?: string;
      public detailsPageUrl?: string;
      public retrievedTimestamp!: number;
      public lastModifiedTimestamp?: number;
      public notes?: string;

      // Fields specific to IEconomicCalendarEvent (make optional in this super-set class)
      public time?: string;
      public currency?: string;
      public eventName?: string;
      public volatilityDescription?: string;
      public impactLevel?: EconomicImpactLevel;
      public actualValue?: string | null; // Already nullable, which is fine
      public forecastValue?: string | null; // Already nullable
      public previousValue?: string | null; // Already nullable

      // Fields specific to IEarningsCalendarEvent (make optional in this super-set class)
      public companyShortName?: string;
      public companyFullName?: string;
      public tickerSymbol?: string;
      public exchange?: string;
      public epsActual?: string | null; // Already nullable
      public epsForecast?: string | null; // Already nullable
      public revenueActual?: string | null; // Already nullable
      public revenueForecast?: string | null; // Already nullable
      public marketCap?: string | null; // Already nullable
      public reportingTime?: EarningsReportingTime;
      public reportingTimeDescription?: string;
      public fiscalPeriod?: string;

      public constructor() {
        // Constructor can remain empty or perform common initializations if any
      }
    } as unknown as new () => ICalendarEventModel, // Type assertion here
    daoClass: CalendarDataAccessObject,
  };
}
