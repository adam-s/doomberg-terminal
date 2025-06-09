import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import {
  CalendarService,
  ICalendarService as IBaseSidePanelCalendarService,
} from './calendar.service';
import {
  type IEconomicCalendarEvent,
  CalendarEventType,
} from '@shared/features/calendar/calendar.types';
import { ICalendarService as ISharedCalendarService } from '@shared/features/calendar/calendar.service';
import { ILogService } from '@shared/services/log.service';
import {
  EconomicCalendarParser,
  type ParsedEconomicEventData,
  type EconomicCalendarApiResponse,
} from './economic-calendar-parser';
import { getTodaysDateString } from '../../utils/commonUtils';

export const IEconomicCalendarService =
  createDecorator<IEconomicCalendarService>('economicCalendarService');

export interface IEconomicCalendarService extends IBaseSidePanelCalendarService {
  fetchCalendarData(startDate?: string, endDate?: string): Promise<ParsedEconomicEventData[]>;
  synchronizeEconomicEventsWithDatabase(
    startDateInput?: string,
    endDateInput?: string,
  ): Promise<void>;
  getEventsRequiringUpdateCheck(): Promise<IEconomicCalendarEvent[]>; // + Add method signature
  attemptEventDataRefresh(eventId: string): Promise<boolean>; // + Add method signature
}

const INVESTING_COM_URL = 'https://www.investing.com/';
const INVESTING_COM_API_URL =
  'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';
const SOURCE_PAGE_SELECTOR = '#overViewBox > div.right > div:nth-child(4) > span:nth-child(2) > a';

// TODO: Determine the correct CSS selector for the "Actual" value on Investing.com event detail pages.
// This is a placeholder and needs to be verified by inspecting the event detail page HTML.
const ACTUAL_VALUE_SELECTOR_ON_EVENT_PAGE = '#eventResults > div.js-result-actual.eventResultItem';
const EVENT_POLL_LOOKBACK_MINUTES = 60; // How far back to look for events that might need updating (e.g., check events up to 60 mins past their time)
const EVENT_POLL_RELEVANCE_WINDOW_MINUTES = 120; // Consider events relevant for polling if their timestamp is within this window from now (past or future).

export class EconomicCalendarService extends CalendarService implements IEconomicCalendarService {
  private static readonly DEFAULT_SOURCE_PROVIDER = 'Investing.com';
  private readonly _calendarParser: EconomicCalendarParser;

  public constructor(
    @ISharedCalendarService private readonly _sharedCalendarService: ISharedCalendarService,
    @ILogService private readonly _logService: ILogService,
  ) {
    super();
    this._calendarParser = new EconomicCalendarParser(_logService);
  }

  public async fetchCalendarData(
    startDateInput?: string,
    endDateInput?: string,
  ): Promise<ParsedEconomicEventData[]> {
    const startDate = startDateInput ?? getTodaysDateString();
    const endDate = endDateInput ?? getTodaysDateString();
    const tabId = await this._tabService.openTab(INVESTING_COM_URL, false);

    try {
      const rawResponse = await this._executeCalendarFetchScript(tabId, startDate, endDate);
      const jsonResponse: EconomicCalendarApiResponse = JSON.parse(rawResponse);
      if (!jsonResponse || typeof jsonResponse.data !== 'string') {
        this._logService.error(
          '[EconomicCalendarService] Invalid API response structure received.',
          { response: jsonResponse },
        );
        return [];
      }
      return this._calendarParser.parseCalendar(jsonResponse);
    } catch (error: unknown) {
      this._logService.error('[EconomicCalendarService] Error fetching or parsing calendar data:', {
        error,
        startDate,
        endDate,
      });
      return []; // Return empty array on error to prevent downstream issues
    } finally {
      await this._tabService.closeTab(tabId);
    }
  }

  private async _executeCalendarFetchScript(
    tabId: number,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    return this._scriptInjectorService.executeScript<[string, string, string], string>(
      tabId,
      async (sd: string, ed: string, apiUrl: string): Promise<string> => {
        const postData = new URLSearchParams({
          'country[]': '5',
          dateFrom: sd,
          dateTo: ed,
          timeZone: '8',
          timeFilter: 'timeRemain',
          currentTab: 'custom',
          limit_from: '0',
        });
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
        return response.text();
      },
      [startDate, endDate, INVESTING_COM_API_URL],
    );
  }

  private async _fetchSourceFromEventPage(
    eventPageUrl: string,
  ): Promise<{ name: string; url: string } | null> {
    if (
      !eventPageUrl ||
      (!eventPageUrl.startsWith('http://') && !eventPageUrl.startsWith('https://'))
    ) {
      this._logService.warn('[EconomicCalendarService] Invalid eventPageUrl for fetching source.', {
        url: eventPageUrl,
      });
      return null;
    }

    try {
      const response = await fetch(eventPageUrl, { method: 'GET' });

      if (!response.ok) {
        this._logService.error(
          `[EconomicCalendarService] HTTP error fetching source from ${eventPageUrl}. Status: ${response.status}`,
        );
        return null;
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const sourceElement = doc.querySelector(SOURCE_PAGE_SELECTOR) as HTMLAnchorElement | null;

      if (sourceElement) {
        const name = sourceElement.textContent?.trim();
        let url = sourceElement.getAttribute('href')?.trim();

        if (name && url) {
          if (url.startsWith('/')) {
            const baseInvestingUrl = new URL(eventPageUrl);
            url = `${baseInvestingUrl.protocol}//${baseInvestingUrl.hostname}${url}`;
          }
          this._logService.trace(
            `[EconomicCalendarService] Found source: "${name}", URL: "${url}" from ${eventPageUrl}`,
          );
          return { name, url };
        }
      }

      this._logService.warn(
        `[EconomicCalendarService] Could not find source on ${eventPageUrl} using selector: ${SOURCE_PAGE_SELECTOR}`,
      );
      return null;
    } catch (error: unknown) {
      this._logService.error(
        `[EconomicCalendarService] Error fetching/parsing source from ${eventPageUrl}:`,
        error,
      );
      return null;
    }
  }

  public async synchronizeEconomicEventsWithDatabase(
    startDateInput?: string,
    endDateInput?: string,
  ): Promise<void> {
    this._logService.info('[EconomicCalendarService] Starting synchronization with database.', {
      startDateInput,
      endDateInput,
    });

    try {
      const fetchedEvents = await this.fetchCalendarData(startDateInput, endDateInput);
      for (const parsedEvent of fetchedEvents) {
        try {
          await this._processSingleEventForSync(parsedEvent);
        } catch (dbError: unknown) {
          this._logService.error(
            `[EconomicCalendarService] Database error processing event (OriginalId: ${parsedEvent.originalEventId}):`,
            dbError,
          );
        }
      }

      this._logService.info('[EconomicCalendarService] Synchronization finished.');
    } catch (fetchError: unknown) {
      this._logService.error(
        '[EconomicCalendarService] Error fetching calendar data for synchronization:',
        fetchError,
      );
      throw fetchError;
    }
  }

  private async _processSingleEventForSync(parsedEvent: ParsedEconomicEventData): Promise<void> {
    const { originalEventId } = parsedEvent;

    if (!originalEventId) {
      this._logService.warn(
        '[EconomicCalendarService] Skipping event due to missing originalEventId.',
        { eventName: parsedEvent.eventName, eventDate: parsedEvent.eventDate },
      );
      return;
    }

    const eventDataForDb: ParsedEconomicEventData = { ...parsedEvent };

    // Fetch existing event first to potentially skip fetching source details
    const existingEvent =
      await this._sharedCalendarService.getEventByOriginalEventId(originalEventId);

    let specificSource: { name: string; url: string } | null = null;
    // Check if we need to fetch source information
    if (existingEvent && existingEvent.sourceProvider && existingEvent.sourceProviderUrl) {
      // Use existing source information
      eventDataForDb.sourceProvider = existingEvent.sourceProvider;
      eventDataForDb.sourceProviderUrl = existingEvent.sourceProviderUrl;
      this._logService.trace(
        `[EconomicCalendarService] Using existing source for OriginalId: ${originalEventId}: ${existingEvent.sourceProvider}`,
      );
    } else if (eventDataForDb.detailsPageUrl) {
      // Fetch source information as existing one is incomplete or event is new
      specificSource = await this._fetchSourceFromEventPage(eventDataForDb.detailsPageUrl);
      if (specificSource) {
        eventDataForDb.sourceProvider = specificSource.name;
        eventDataForDb.sourceProviderUrl = specificSource.url;
        this._logService.trace(
          `[EconomicCalendarService] Fetched specific source for OriginalId: ${originalEventId}: ${specificSource.name}`,
        );
      } else {
        this._logService.trace(
          `[EconomicCalendarService] Could not fetch specific source for OriginalId: ${originalEventId}. Will use default or existing partial data.`,
        );
      }
    }

    // Ensure a default source provider if none was set from existing or fetched
    eventDataForDb.sourceProvider =
      eventDataForDb.sourceProvider ?? EconomicCalendarService.DEFAULT_SOURCE_PROVIDER;
    // sourceProviderUrl can remain undefined if not found and not existing

    if (existingEvent) {
      const updates = this._getEventDifferences(
        eventDataForDb,
        existingEvent as IEconomicCalendarEvent,
      );
      // debugger; // Keep debugger if you still need it, or remove
      if (Object.keys(updates).length > 0) {
        await this._sharedCalendarService.updateEvent(existingEvent.id, updates);
        this._logService.info(
          `[EconomicCalendarService] Updated existing event (ID: ${existingEvent.id}, OriginalId: ${originalEventId}).`,
          { updates },
        );
      } else {
        this._logService.trace(
          `[EconomicCalendarService] Event (ID: ${existingEvent.id}, OriginalId: ${originalEventId}) found, but no changes detected. Skipping update.`,
        );
      }
      return;
    }

    const eventToCreate: Omit<
      IEconomicCalendarEvent,
      'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp'
    > = {
      ...eventDataForDb,
    };

    await this._sharedCalendarService.createEvent(eventToCreate);
    this._logService.info(
      `[EconomicCalendarService] Created new event for OriginalId: ${originalEventId} with source '${eventDataForDb.sourceProvider}'.`,
    );
  }

  private _getEventDifferences(
    parsedEvent: ParsedEconomicEventData,
    existingEvent: IEconomicCalendarEvent,
  ): Partial<
    Omit<
      IEconomicCalendarEvent,
      'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'eventType'
    >
  > {
    const updates: Partial<
      Omit<
        IEconomicCalendarEvent,
        'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'eventType'
      >
    > = {};

    const diff = <K extends keyof typeof updates>(
      key: K,
      parsedVal: (typeof updates)[K],
      existingVal: (typeof updates)[K],
    ) => {
      if (parsedVal !== existingVal) {
        updates[key] = parsedVal;
      }
    };

    diff('eventDate', parsedEvent.eventDate, existingEvent.eventDate);
    diff('eventTimestamp', parsedEvent.eventTimestamp, existingEvent.eventTimestamp);
    diff('country', parsedEvent.country, existingEvent.country);
    diff('detailsPageUrl', parsedEvent.detailsPageUrl, existingEvent.detailsPageUrl);

    // sourceProvider and sourceProviderUrl are handled carefully in _processSingleEventForSync
    // to ensure that if a specific source is found, it overrides a default one.
    // However, if the existing event already had a *different specific* source,
    // and the new parsed event (after its own fetch) has *another specific* source,
    // this comparison is still valid.
    if (
      parsedEvent.sourceProvider &&
      parsedEvent.sourceProvider.trim() !== '' &&
      parsedEvent.sourceProvider !== existingEvent.sourceProvider
    ) {
      updates.sourceProvider = parsedEvent.sourceProvider;
    }
    // Compare sourceProviderUrl, but do not overwrite an existing value with undefined/null unless explicitly intended
    if (parsedEvent.sourceProviderUrl !== existingEvent.sourceProviderUrl) {
      if (parsedEvent.sourceProviderUrl !== undefined && parsedEvent.sourceProviderUrl !== null) {
        updates.sourceProviderUrl = parsedEvent.sourceProviderUrl;
      } else if (
        existingEvent.sourceProviderUrl &&
        (parsedEvent.sourceProviderUrl === '' || parsedEvent.sourceProviderUrl === null)
      ) {
        // Only clear if explicitly set to empty string or null
        updates.sourceProviderUrl = parsedEvent.sourceProviderUrl;
      }
    }

    diff('time', parsedEvent.time, existingEvent.time);
    diff('currency', parsedEvent.currency, existingEvent.currency);
    diff('eventName', parsedEvent.eventName, existingEvent.eventName);
    diff(
      'volatilityDescription',
      parsedEvent.volatilityDescription,
      existingEvent.volatilityDescription,
    );
    diff('impactLevel', parsedEvent.impactLevel, existingEvent.impactLevel);
    diff('actualValue', parsedEvent.actualValue, existingEvent.actualValue);
    diff('forecastValue', parsedEvent.forecastValue, existingEvent.forecastValue);
    diff('previousValue', parsedEvent.previousValue, existingEvent.previousValue);

    return updates;
  }

  /**
   * Fetches events from the database that may require an update to their actual value.
   * These are events that have occurred recently (or are about to occur), have a previousValue,
   * but do not yet have an actualValue, and possess a detailsPageUrl.
   */
  public async getEventsRequiringUpdateCheck(): Promise<IEconomicCalendarEvent[]> {
    const now = Date.now();
    const startTimeFilter = now - EVENT_POLL_LOOKBACK_MINUTES * 60 * 1000;
    const endTimeFilter = now + EVENT_POLL_RELEVANCE_WINDOW_MINUTES * 60 * 1000;

    this._logService.trace(
      `[EconomicCalendarService] Getting events for update check between ${new Date(
        startTimeFilter,
      ).toISOString()} and ${new Date(endTimeFilter).toISOString()}`,
    );

    try {
      // Get all events within the timestamp range
      const allEventsInRange = await this._sharedCalendarService.getEventsByDateRange(
        startTimeFilter,
        endTimeFilter,
      );

      // Filter to only economic events and type guard
      const economicEvents = allEventsInRange.filter(
        (event): event is IEconomicCalendarEvent => event.eventType === CalendarEventType.ECONOMIC,
      );

      const eventsToUpdate = economicEvents.filter((event: IEconomicCalendarEvent): boolean => {
        const hasPreviousValue = event.previousValue !== null && event.previousValue !== undefined;
        const needsActualValue = event.actualValue === null || event.actualValue === undefined;
        const hasDetailsPage = Boolean(event.detailsPageUrl);
        const eventTimeHasPassedOrIsImminent = event.eventTimestamp <= now + 5 * 60 * 1000;
        const eventIsInTimeWindow =
          event.eventTimestamp >= startTimeFilter && event.eventTimestamp <= endTimeFilter;

        return (
          hasPreviousValue &&
          needsActualValue &&
          hasDetailsPage &&
          eventTimeHasPassedOrIsImminent &&
          eventIsInTimeWindow
        );
      });

      if (eventsToUpdate.length > 0) {
        this._logService.info(
          `[EconomicCalendarService] Found ${eventsToUpdate.length} events requiring update check.`,
        );
      } else {
        this._logService.trace(
          '[EconomicCalendarService] No events currently require an update check.',
        );
      }
      return eventsToUpdate;
    } catch (error: unknown) {
      this._logService.error(
        '[EconomicCalendarService] Error fetching events requiring update check:',
        error,
      );
      return [];
    }
  }

  /**
   * Attempts to fetch the live 'actual' value for a given event from its details page
   * and updates the event in the database if a new value is found.
   * @param eventId The ID of the event to refresh.
   * @returns True if the event was updated, false otherwise.
   */
  public async attemptEventDataRefresh(eventId: string): Promise<boolean> {
    this._logService.trace(
      `[EconomicCalendarService] Attempting data refresh for event ID: ${eventId}`,
    );
    const event = await this._sharedCalendarService.getEvent(eventId);

    if (!event) {
      this._logService.warn(
        `[EconomicCalendarService] Event with ID ${eventId} not found for refresh.`,
      );
      return false;
    }

    // Type guard to ensure it's an economic calendar event
    if (event.eventType !== CalendarEventType.ECONOMIC) {
      this._logService.warn(
        `[EconomicCalendarService] Event ${eventId} is not an economic event. Skipping refresh.`,
      );
      return false;
    }

    const economicEvent = event as IEconomicCalendarEvent;

    if (economicEvent.actualValue !== null && economicEvent.actualValue !== undefined) {
      this._logService.trace(
        `[EconomicCalendarService] Event ${eventId} (OriginalId: ${economicEvent.originalEventId}) already has an actual value: '${economicEvent.actualValue}'. Skipping refresh.`,
      );
      return false;
    }

    if (!economicEvent.detailsPageUrl) {
      this._logService.warn(
        `[EconomicCalendarService] Event ${eventId} (OriginalId: ${economicEvent.originalEventId}) has no detailsPageUrl. Cannot refresh.`,
      );
      return false;
    }

    if (economicEvent.previousValue === null || economicEvent.previousValue === undefined) {
      this._logService.trace(
        `[EconomicCalendarService] Event ${eventId} (OriginalId: ${economicEvent.originalEventId}) has no previousValue. Unlikely to update with an actual. Skipping refresh.`,
      );
      return false;
    }

    const liveData = await this._fetchLiveEventDataFromPage(economicEvent.detailsPageUrl);

    if (liveData && liveData.actual !== null && liveData.actual !== undefined) {
      if (economicEvent.actualValue !== liveData.actual) {
        const updates: Partial<IEconomicCalendarEvent> = {
          actualValue: liveData.actual,
        };
        try {
          await this._sharedCalendarService.updateEvent(economicEvent.id, updates);
          this._logService.info(
            `[EconomicCalendarService] Successfully updated actual value for event ${eventId} (OriginalId: ${economicEvent.originalEventId}) to '${liveData.actual}'.`,
          );
          return true;
        } catch (error: unknown) {
          this._logService.error(
            `[EconomicCalendarService] Error updating event ${eventId} (OriginalId: ${economicEvent.originalEventId}) with new actual value:`,
            error,
          );
          return false;
        }
      } else {
        this._logService.trace(
          `[EconomicCalendarService] Fetched actual value for event ${eventId} (OriginalId: ${economicEvent.originalEventId}) is same as existing ('${economicEvent.actualValue}') or still null. No update needed.`,
        );
      }
    } else {
      this._logService.trace(
        `[EconomicCalendarService] Could not fetch live actual data for event ${eventId} (OriginalId: ${economicEvent.originalEventId}) from ${economicEvent.detailsPageUrl}.`,
      );
    }
    return false;
  }

  /**
   * Fetches the live event data (specifically the 'Actual' value) from the event's detail page.
   * This method now runs in the main extension context, not injected into a page.
   * @param detailsPageUrl The URL of the event detail page.
   * @returns An object containing the actual value, or null if not found or an error occurs.
   */
  private async _fetchLiveEventDataFromPage(
    detailsPageUrl: string,
  ): Promise<{ actual: string | null } | null> {
    if (
      !detailsPageUrl ||
      (!detailsPageUrl.startsWith('http://') && !detailsPageUrl.startsWith('https://'))
    ) {
      this._logService.warn(
        '[EconomicCalendarService] Invalid detailsPageUrl for fetching live event data.',
        { url: detailsPageUrl },
      );
      return null;
    }

    this._logService.trace(
      `[EconomicCalendarService] Fetching live data from URL: ${detailsPageUrl}`,
    );

    try {
      const response = await fetch(detailsPageUrl, {
        method: 'GET',
        headers: {
          // Add any headers that might be necessary to mimic a browser request if facing issues
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
        },
      });

      if (!response.ok) {
        this._logService.error(
          `[EconomicCalendarService] HTTP error fetching live data from ${detailsPageUrl}. Status: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const actualValueElement = doc.querySelector(ACTUAL_VALUE_SELECTOR_ON_EVENT_PAGE);

      if (actualValueElement) {
        const actualText = actualValueElement.textContent?.trim();
        if (
          actualText &&
          actualText !== '\u00A0' /* &nbsp; */ &&
          actualText !== '-' &&
          actualText !== ''
        ) {
          this._logService.info(
            `[EconomicCalendarService] Found live actual value: "${actualText}" from ${detailsPageUrl}`,
          );
          return { actual: actualText };
        }
        this._logService.trace(
          `[EconomicCalendarService] Actual value element found on ${detailsPageUrl} but content is empty, placeholder, or non-breaking space: "${actualText}"`,
        );
      } else {
        this._logService.warn(
          `[EconomicCalendarService] Could not find actual value element on ${detailsPageUrl} using selector: ${ACTUAL_VALUE_SELECTOR_ON_EVENT_PAGE}`,
        );
      }
      return { actual: null }; // Explicitly return null if not found or empty
    } catch (error: unknown) {
      this._logService.error(
        `[EconomicCalendarService] Error fetching/parsing live data from ${detailsPageUrl}:`,
        error,
      );
      return null;
    }
  }
}
