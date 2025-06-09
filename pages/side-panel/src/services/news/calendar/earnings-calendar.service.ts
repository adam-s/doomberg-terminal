import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import {
  CalendarService,
  ICalendarService as IBaseSidePanelCalendarService,
} from './calendar.service';
import {
  type IEarningsCalendarEvent,
  CalendarEventType,
  type ICalendarEventModel,
} from '@shared/features/calendar/calendar.types';
import { ICalendarService as ISharedCalendarService } from '@shared/features/calendar/calendar.service';
import { ILogService } from '@shared/services/log.service';
import { EarningsCalendarParser, type ParsedEarningsEventData } from './earnings-calendar-parser';

export const IEarningsCalendarService =
  createDecorator<IEarningsCalendarService>('earningsCalendarService');

export interface IEarningsCalendarService extends IBaseSidePanelCalendarService {
  fetchCalendarData(filter: EarningsCalendarFilter): Promise<ParsedEarningsEventData[]>;
  synchronizeEarningsEventsWithDatabase(): Promise<void>;
}

const INVESTING_COM_EARNINGS_CALENDAR_URL = 'https://www.investing.com/earnings-calendar/';
const EARNINGS_API_URL =
  'https://www.investing.com/earnings-calendar/Service/getCalendarFilteredData';

interface EarningsApiResponse {
  data?: string;
  // Add other fields if known and needed, otherwise keep it minimal
}

export enum EarningsCalendarTab {
  NEXT_WEEK = 'nextWeek',
  THIS_WEEK = 'thisWeek',
  TOMORROW = 'tomorrow',
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  CUSTOM = 'custom',
}

export interface EarningsCalendarFilter {
  currentTab: EarningsCalendarTab;
  dateFrom?: string;
  dateTo?: string;
}

export interface EarningsCalendarRequestOptions {
  country: string; // e.g., '5' for United States
  currentTab: EarningsCalendarTab;
  limitFrom: string; // e.g., '0'
  dateFrom?: string; // only for CUSTOM
  dateTo?: string; // only for CUSTOM
}

export class EarningsCalendarService extends CalendarService implements IEarningsCalendarService {
  private static readonly DEFAULT_SOURCE_PROVIDER = 'Investing.com Earnings';
  private static readonly MIN_MARKET_CAP = 10_000_000_000; // 10B
  private readonly _calendarParser: EarningsCalendarParser;

  public constructor(
    // Corrected to use IInstantiationService to inject shared services
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @ISharedCalendarService private readonly _sharedCalendarService: ISharedCalendarService,
    @ILogService private readonly _logService: ILogService,
  ) {
    super();
    this._calendarParser = this.instantiationService.createInstance(EarningsCalendarParser);
    this._synchronizeEarningsEventsOnStartup();
  }

  private _synchronizeEarningsEventsOnStartup(): void {
    this.synchronizeEarningsEventsWithDatabase()
      .then(() => {
        this._logService.info(
          '[EarningsCalendarService] Synchronized earnings events with database.',
        );
      })
      .catch((error: unknown) => {
        this._logService.error(
          '[EarningsCalendarService] Error synchronizing earnings events with database on construction:',
          error,
        );
      });
  }

  private async _executeEarningsCalendarFetchScript(
    tabId: number,
    filter: EarningsCalendarFilter,
  ): Promise<string> {
    return this._scriptInjectorService.executeScript<
      [string, string | null, string | null, string],
      string
    >(
      tabId,
      async (
        currentTab: string,
        dateFrom: string | null,
        dateTo: string | null,
        apiUrl: string,
      ): Promise<string> => {
        const postData = new URLSearchParams({
          'country[]': '5', // United States; adjust as needed
          currentTab,
          limit_from: '0',
        });

        if (currentTab === 'custom') {
          if (dateFrom) {
            postData.append('dateFrom', dateFrom);
          }
          if (dateTo) {
            postData.append('dateTo', dateTo);
          }
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: postData.toString(),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} from ${apiUrl}`);
        }
        return response.text(); // Return raw text to be parsed as JSON by the caller
      },
      [filter.currentTab, filter.dateFrom ?? null, filter.dateTo ?? null, EARNINGS_API_URL],
    );
  }

  private async _fetchRawHtmlData(tabId: number, filter: EarningsCalendarFilter): Promise<string> {
    const rawResponse = await this._executeEarningsCalendarFetchScript(tabId, filter);
    const jsonResponse: EarningsApiResponse = JSON.parse(rawResponse);
    const tableBodyHtml = jsonResponse?.data || '';

    if (!tableBodyHtml || tableBodyHtml.trim() === '') {
      this._logService.warn('[EarningsCalendarService] Fetched empty HTML for earnings calendar.');
      return ''; // Return empty string to indicate no data
    }
    return tableBodyHtml;
  }

  public async fetchCalendarData(
    filter: EarningsCalendarFilter,
  ): Promise<ParsedEarningsEventData[]> {
    const tabId = await this._tabService.openTab(INVESTING_COM_EARNINGS_CALENDAR_URL, false);

    try {
      const tableBodyHtml = await this._fetchRawHtmlData(tabId, filter);

      if (!tableBodyHtml) {
        // If _fetchRawHtmlData returned an empty string, it means no data or empty data.
        return [];
      }

      return this._calendarParser.parseCalendar(tableBodyHtml);
    } catch (error) {
      this._logService.error('[EarningsCalendarService] Error fetching or parsing earnings data:', {
        error,
      });
      throw error; // Re-throw the error to be handled by the caller
    } finally {
      await this._tabService.closeTab(tabId);
    }
  }

  public async synchronizeEarningsEventsWithDatabase(): Promise<void> {
    this._logService.info(
      '[EarningsCalendarService] Starting synchronization of earnings events for This Week and Next Week.',
    );
    const allParsedEvents: ParsedEarningsEventData[] = [];

    try {
      // Fetch for THIS_WEEK
      const thisWeekFilter: EarningsCalendarFilter = { currentTab: EarningsCalendarTab.THIS_WEEK };
      this._logService.info(
        `[EarningsCalendarService] Fetching data for tab: ${EarningsCalendarTab.THIS_WEEK}`,
      );
      try {
        const thisWeekEvents = await this.fetchCalendarData(thisWeekFilter);
        allParsedEvents.push(...thisWeekEvents);
        this._logService.info(
          `[EarningsCalendarService] Fetched ${thisWeekEvents.length} events for tab: ${EarningsCalendarTab.THIS_WEEK}. Current total: ${allParsedEvents.length}`,
        );
      } catch (fetchErrorThisWeek: unknown) {
        this._logService.error(
          `[EarningsCalendarService] Error fetching earnings calendar data for tab ${EarningsCalendarTab.THIS_WEEK}:`,
          fetchErrorThisWeek,
        );
        // Continue to try fetching next week's data
      }

      // Fetch for NEXT_WEEK
      const nextWeekFilter: EarningsCalendarFilter = { currentTab: EarningsCalendarTab.NEXT_WEEK };
      this._logService.info(
        `[EarningsCalendarService] Fetching data for tab: ${EarningsCalendarTab.NEXT_WEEK}`,
      );
      try {
        const nextWeekEvents = await this.fetchCalendarData(nextWeekFilter);
        allParsedEvents.push(...nextWeekEvents);
        this._logService.info(
          `[EarningsCalendarService] Fetched ${nextWeekEvents.length} events for tab: ${EarningsCalendarTab.NEXT_WEEK}. Current total: ${allParsedEvents.length}`,
        );
      } catch (fetchErrorNextWeek: unknown) {
        this._logService.error(
          `[EarningsCalendarService] Error fetching earnings calendar data for tab ${EarningsCalendarTab.NEXT_WEEK}:`,
          fetchErrorNextWeek,
        );
      }

      if (allParsedEvents.length === 0) {
        this._logService.warn(
          '[EarningsCalendarService] No events fetched from This Week or Next Week. Synchronization will not process any events.',
        );
        return;
      }

      this._logService.info(
        `[EarningsCalendarService] Total events fetched from This Week and Next Week: ${allParsedEvents.length}. Processing for database sync.`,
      );

      for (const parsedEvent of allParsedEvents) {
        try {
          await this._processSingleEventForSync(parsedEvent);
        } catch (dbError: unknown) {
          this._logService.error(
            `[EarningsCalendarService] Database error processing event (OriginalId: ${parsedEvent.originalEventId ?? 'N/A'}, Ticker: ${parsedEvent.tickerSymbol ?? 'N/A'}):`,
            dbError,
          );
        }
      }

      this._logService.info('[EarningsCalendarService] Earnings events synchronization finished.');
    } catch (error: unknown) {
      this._logService.error(
        '[EarningsCalendarService] Unexpected error during earnings calendar data synchronization:',
        error,
      );
      throw error;
    }
  }

  private async _processSingleEventForSync(parsedEvent: ParsedEarningsEventData): Promise<void> {
    const { originalEventId, tickerSymbol, eventDate, marketCap } = parsedEvent;

    // Parse the market cap string to a number for comparison
    const numericalMarketCap = this._parseMarketCapToNumber(marketCap);
    if (
      numericalMarketCap !== null &&
      numericalMarketCap < EarningsCalendarService.MIN_MARKET_CAP
    ) {
      // this._logService.info(`[EarningsCalendarService] Skipping event due to market cap < 10B.`, {
      //   eventName: parsedEvent.companyShortName,
      //   tickerSymbol,
      //   eventDate,
      //   marketCap,
      // });
      return;
    }

    if (!originalEventId) {
      this._logService.warn(
        '[EarningsCalendarService] Skipping event due to missing originalEventId.',
        { eventName: parsedEvent.companyShortName, tickerSymbol, eventDate },
      );
      return;
    }

    const eventDataForDb: ParsedEarningsEventData = {
      ...parsedEvent,
      sourceProvider: EarningsCalendarService.DEFAULT_SOURCE_PROVIDER,
      sourceProviderUrl: parsedEvent.detailsPageUrl || INVESTING_COM_EARNINGS_CALENDAR_URL,
    };

    const existingEvent =
      await this._sharedCalendarService.getEventByOriginalEventId(originalEventId);

    if (existingEvent) {
      if (existingEvent.eventType !== CalendarEventType.EARNINGS) {
        this._logService.warn(
          `[EarningsCalendarService] Existing event with OriginalId ${originalEventId} is not an earnings event. Skipping update.`,
          { existingEventType: existingEvent.eventType },
        );
        return;
      }
      const updates = this._getEventDifferences(
        eventDataForDb,
        existingEvent as IEarningsCalendarEvent,
      );
      if (Object.keys(updates).length > 0) {
        await this._sharedCalendarService.updateEvent(existingEvent.id, updates);
        this._logService.info(
          `[EarningsCalendarService] Updated existing earnings event (ID: ${existingEvent.id}, OriginalId: ${originalEventId}, Ticker: ${tickerSymbol}).`,
          { updates },
        );
      } else {
        this._logService.trace(
          `[EarningsCalendarService] Earnings event (ID: ${existingEvent.id}, OriginalId: ${originalEventId}, Ticker: ${tickerSymbol}) found, but no changes detected. Skipping update.`,
        );
      }
    } else {
      const eventToCreate: Omit<
        IEarningsCalendarEvent,
        'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp'
      > = {
        ...eventDataForDb,
        eventType: CalendarEventType.EARNINGS,
      };
      try {
        // Ensure the created event is cast to ICalendarEventModel for the shared service method
        await this._sharedCalendarService.createEvent(eventToCreate as ICalendarEventModel);
        this._logService.info(
          `[EarningsCalendarService] Created new earnings event for OriginalId: ${originalEventId} (Ticker: ${tickerSymbol}) with source '${eventDataForDb.sourceProvider}'.`,
        );
      } catch (createError) {
        this._logService.error(
          `[EarningsCalendarService] Failed to create new earnings event for OriginalId: ${originalEventId} (Ticker: ${tickerSymbol})`,
          createError,
        );
      }
    }
  }

  /**
   * Parses a market cap string (e.g., "2.43M", "10.1B") to a number.
   * Returns null if parsing fails or input is null/undefined/empty.
   */
  private _parseMarketCapToNumber(marketCap: string | null | undefined): number | null {
    if (!marketCap) return null;
    const cleaned = marketCap.trim().replace(/,/g, '');
    if (cleaned === '' || cleaned === '--') return null;
    const lastChar = cleaned.slice(-1).toUpperCase();
    let multiplier = 1;
    let numStr = cleaned;
    if (lastChar === 'T') {
      multiplier = 1_000_000_000_000;
      numStr = cleaned.slice(0, -1);
    } else if (lastChar === 'B') {
      multiplier = 1_000_000_000;
      numStr = cleaned.slice(0, -1);
    } else if (lastChar === 'M') {
      multiplier = 1_000_000;
      numStr = cleaned.slice(0, -1);
    }
    const num = parseFloat(numStr);
    if (isNaN(num)) return null;
    return num * multiplier;
  }

  private _getEventDifferences(
    parsedEvent: ParsedEarningsEventData,
    existingEvent: IEarningsCalendarEvent,
  ): Partial<
    Omit<
      IEarningsCalendarEvent,
      'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'eventType'
    >
  > {
    const updates: Partial<
      Omit<
        IEarningsCalendarEvent,
        'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'eventType'
      >
    > = {};

    // Define a more specific type for the keys of updates to avoid using 'any'
    type UpdateableEventKeys = keyof Omit<
      IEarningsCalendarEvent,
      'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'eventType'
    >;

    const diff = <K extends UpdateableEventKeys>(
      key: K,
      parsedVal: IEarningsCalendarEvent[K] | undefined | null, // Allow undefined from parsedEvent
      existingVal: IEarningsCalendarEvent[K] | undefined | null,
    ) => {
      const pVal = parsedVal === undefined ? null : parsedVal;
      const eVal = existingVal === undefined ? null : existingVal;
      if (pVal !== eVal) {
        updates[key] = parsedVal as IEarningsCalendarEvent[K];
      }
    };

    diff('eventDate', parsedEvent.eventDate, existingEvent.eventDate);
    diff('eventTimestamp', parsedEvent.eventTimestamp, existingEvent.eventTimestamp);
    diff('country', parsedEvent.country, existingEvent.country);
    diff('companyShortName', parsedEvent.companyShortName, existingEvent.companyShortName);
    diff('companyFullName', parsedEvent.companyFullName, existingEvent.companyFullName);
    diff('tickerSymbol', parsedEvent.tickerSymbol, existingEvent.tickerSymbol);
    diff('exchange', parsedEvent.exchange, existingEvent.exchange);
    diff('detailsPageUrl', parsedEvent.detailsPageUrl, existingEvent.detailsPageUrl);
    diff('sourceProvider', parsedEvent.sourceProvider, existingEvent.sourceProvider);
    diff('sourceProviderUrl', parsedEvent.sourceProviderUrl, existingEvent.sourceProviderUrl);
    diff('epsActual', parsedEvent.epsActual, existingEvent.epsActual);
    diff('epsForecast', parsedEvent.epsForecast, existingEvent.epsForecast);
    diff('revenueActual', parsedEvent.revenueActual, existingEvent.revenueActual);
    diff('revenueForecast', parsedEvent.revenueForecast, existingEvent.revenueForecast);
    diff('marketCap', parsedEvent.marketCap, existingEvent.marketCap);
    diff('reportingTime', parsedEvent.reportingTime, existingEvent.reportingTime);
    diff(
      'reportingTimeDescription',
      parsedEvent.reportingTimeDescription,
      existingEvent.reportingTimeDescription,
    );

    return updates;
  }
}
