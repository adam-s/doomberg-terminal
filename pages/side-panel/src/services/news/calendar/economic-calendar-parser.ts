import { ILogService } from '@shared/services/log.service';
import {
  type IEconomicCalendarEvent,
  CalendarEventType,
  EconomicImpactLevel,
} from '@shared/features/calendar/calendar.types';

/**
 * Response structure from the economic calendar API
 */
export interface EconomicCalendarApiResponse {
  dateFrom: string;
  dateTo: string;
  last_time_scope: number;
  params: {
    country: string[];
    dateFrom: string;
    dateTo: string;
    filterButtonState: string;
    isFiltered: boolean;
    limit: string;
    offsetSec: number;
    requestDateTimeFormatted: string;
    timeFilter: string;
    timeFrame: string;
    timeZone: string;
    timezoneCurrentTime: string;
    timezoneFormat: string;
    timezoneId: string;
    parseDataBy: string;
    pids: string[];
    rows_num: number;
    timeframe: string;
  };
  data: string; // HTML content containing the calendar rows
  bind_scroll_handler: boolean;
}

/**
 * Represents the data structure for an economic event as parsed from the source,
 * before it's fully transformed into the IEconomicCalendarEvent domain model.
 * It omits fields that are typically added by the system later (e.g., UUID id, timestamps).
 */
export type ParsedEconomicEventData = Omit<
  IEconomicCalendarEvent,
  'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'notes'
>;

export function isParsedEconomicEventData(obj: unknown): obj is ParsedEconomicEventData {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const event = obj as Partial<ParsedEconomicEventData>;

  // Helper to get numeric values from the EconomicImpactLevel enum
  const numericImpactLevelValues = Object.values(EconomicImpactLevel).filter(
    (v): v is EconomicImpactLevel => typeof v === 'number',
  );

  return (
    event.eventType === CalendarEventType.ECONOMIC && // Ensures it's specifically an economic event
    typeof event.eventDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(event.eventDate) && // Added format check for eventDate
    typeof event.eventTimestamp === 'number' &&
    event.eventTimestamp > 0 && // Ensure positive timestamp
    typeof event.country === 'string' &&
    event.country.trim() !== '' && // Ensure non-empty country
    (typeof event.originalEventId === 'string' || event.originalEventId === undefined) &&
    (typeof event.detailsPageUrl === 'string' || event.detailsPageUrl === undefined) &&
    // Aligned with ParsedEconomicEventData: sourceProvider and sourceProviderUrl can be string or undefined
    (typeof event.sourceProvider === 'string' || event.sourceProvider === undefined) &&
    (typeof event.sourceProviderUrl === 'string' || event.sourceProviderUrl === undefined) &&
    typeof event.time === 'string' &&
    event.time.trim() !== '' && // Ensure non-empty time
    typeof event.currency === 'string' &&
    event.currency.trim() !== '' && // Ensure non-empty currency
    typeof event.eventName === 'string' &&
    event.eventName.trim() !== '' && // Ensure non-empty eventName
    (typeof event.volatilityDescription === 'string' ||
      event.volatilityDescription === undefined) &&
    // Corrected impactLevel check: must be a number and a valid enum value, or undefined
    (event.impactLevel === undefined ||
      (typeof event.impactLevel === 'number' &&
        numericImpactLevelValues.includes(event.impactLevel))) &&
    (event.actualValue === null || typeof event.actualValue === 'string') &&
    (event.forecastValue === null || typeof event.forecastValue === 'string') &&
    (event.previousValue === null || typeof event.previousValue === 'string')
  );
}

// Helper function to filter out null or undefined values in a type-safe way
function notNull<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

export class EconomicCalendarParser {
  private _timezoneOffsetMinutes: number = 0;

  public constructor(private readonly _logService: ILogService) {}

  private _parseDocument(html: string): Document {
    // Wrap in table/tbody because querySelectorAll on a DocumentFragment doesn't work as expected for tr/td.
    // The browser parser will create the tbody if it's missing from the table.
    return new DOMParser().parseFromString(
      `<table><tbody>${html.trim()}</tbody></table>`,
      'text/html',
    );
  }

  private _parseTimezone(response: EconomicCalendarApiResponse): void {
    // offsetSec is the timezone offset in seconds from UTC
    // Convert to minutes for easier date manipulation
    this._timezoneOffsetMinutes = response.params.offsetSec / 60;
  }

  private _adjustDateForTimezone(date: Date): Date {
    // Apply the timezone offset to get the correct local time
    const adjustedTime = date.getTime() + this._timezoneOffsetMinutes * 60 * 1000;
    return new Date(adjustedTime);
  }

  private _extractEventRows(doc: Document): Element[] {
    return Array.from(doc.querySelectorAll('tr.js-event-item'));
  }

  public parseCalendar(jsonResponse: EconomicCalendarApiResponse): ParsedEconomicEventData[] {
    // Parse timezone information first
    this._parseTimezone(jsonResponse);

    const rowsHtml = jsonResponse.data;
    const doc = this._parseDocument(rowsHtml);
    const eventElements = this._extractEventRows(doc);

    return eventElements.map(row => this._parseEventRow(row)).filter(notNull);
  }

  private _parseEventRow(row: Element): ParsedEconomicEventData | null {
    try {
      const eventDateTimeString = row.getAttribute('data-event-datetime'); // e.g., "2025/05/28 04:00:00"
      if (!eventDateTimeString) {
        this._logService.warn('[EconomicCalendarParser] Event row missing data-event-datetime', {
          rowId: row.id,
        });
        return null;
      }

      // eventDateTimeString is local time in the API's timezone.
      // Example: "2025/05/28 04:00:00", and API timezone offset is _timezoneOffsetMinutes.

      const dateTimeParts = eventDateTimeString.split(' ');
      if (dateTimeParts.length !== 2) {
        this._logService.warn(
          '[EconomicCalendarParser] Invalid format for data-event-datetime string',
          { dateTimeString: eventDateTimeString, rowId: row.id },
        );
        return null;
      }

      const datePart = dateTimeParts[0];
      const timePart = dateTimeParts[1];

      const dateComponents = datePart.split('/');
      const timeComponents = timePart.split(':');

      if (dateComponents.length !== 3 || timeComponents.length !== 3) {
        this._logService.warn(
          '[EconomicCalendarParser] Invalid date or time components from data-event-datetime',
          { dateTimeString: eventDateTimeString, rowId: row.id },
        );
        return null;
      }

      const year = parseInt(dateComponents[0], 10);
      const month = parseInt(dateComponents[1], 10); // 1-based month
      const day = parseInt(dateComponents[2], 10);
      const hour = parseInt(timeComponents[0], 10);
      const minute = parseInt(timeComponents[1], 10);
      const second = parseInt(timeComponents[2], 10);

      if (
        isNaN(year) ||
        isNaN(month) ||
        isNaN(day) ||
        isNaN(hour) ||
        isNaN(minute) ||
        isNaN(second)
      ) {
        this._logService.warn(
          '[EconomicCalendarParser] Non-numeric date/time components from data-event-datetime',
          { dateTimeString: eventDateTimeString, rowId: row.id },
        );
        return null;
      }

      // Create a timestamp as if these local date/time components were UTC
      const timestampAsIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);

      // Adjust to get the true UTC timestamp of the event.
      // If _timezoneOffsetMinutes is, e.g., -240 (for UTC-4), this means the local time is 4 hours behind UTC.
      // So, true UTC = local time + 4 hours.
      // trueUtcTimestamp = timestampAsIfUtc - (_timezoneOffsetMinutes * 60 * 1000)
      const eventTimestamp = timestampAsIfUtc - this._timezoneOffsetMinutes * 60 * 1000;

      // The eventDate string (YYYY-MM-DD) is the local date part.
      const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // The 'time' field for the event object is the local time string from the table cell or constructed.
      const timeCellContent = row.querySelector('td.time')?.textContent?.trim();
      const time =
        timeCellContent && timeCellContent !== 'N/A' && timeCellContent !== ''
          ? timeCellContent
          : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      const country =
        row.querySelector('td.flagCur span[title]')?.getAttribute('title')?.trim() ?? 'N/A';
      const currencyCellText = row.querySelector('td.flagCur')?.textContent?.trim();
      const currency = currencyCellText ? currencyCellText.slice(-3).trim() : 'N/A';

      const eventCell = row.querySelector('td.event');
      const eventName = eventCell?.textContent?.trim() ?? 'N/A';
      let detailsPageUrl = eventCell?.querySelector('a')?.getAttribute('href') ?? undefined;

      if (detailsPageUrl && detailsPageUrl.startsWith('/')) {
        detailsPageUrl = `https://www.investing.com${detailsPageUrl}`;
      }

      const { volatilityDescription, impactLevel } = this._parseVolatilityAndImpact(row);

      const actualValue = row.querySelector('td[id^="eventActual_"]')?.textContent?.trim() ?? null;
      const forecastValue =
        row.querySelector('td[id^="eventForecast_"]')?.textContent?.trim() ?? null;
      const previousValue =
        row.querySelector('td[id^="eventPrevious_"]')?.textContent?.trim() ?? null;

      const originalEventId = row.getAttribute('id')?.replace('eventRowId_', '') ?? undefined;

      return {
        eventType: CalendarEventType.ECONOMIC,
        eventDate, // YYYY-MM-DD of the event in its local (API-specified) timezone
        eventTimestamp, // True UTC millisecond timestamp of the event
        country,
        originalEventId,
        detailsPageUrl,
        sourceProvider: undefined, // Will be set by the service
        sourceProviderUrl: undefined, // Will be set by the service
        time, // HH:MM string of the event in its local (API-specified) timezone
        currency,
        eventName,
        volatilityDescription,
        impactLevel,
        actualValue: actualValue === '\u00A0' || actualValue === '' ? null : actualValue,
        forecastValue: forecastValue === '\u00A0' || forecastValue === '' ? null : forecastValue,
        previousValue: previousValue === '\u00A0' || previousValue === '' ? null : previousValue,
      };
    } catch (error: unknown) {
      this._logService.error('[EconomicCalendarParser] Error parsing event row:', {
        error,
        rowId: row.id,
        rowOuterHtml: row.outerHTML,
      });
      return null;
    }
  }

  private _parseVolatilityAndImpact(row: Element): {
    volatilityDescription?: string;
    impactLevel?: EconomicImpactLevel;
  } {
    const cell = row.querySelector('td.sentiment');
    if (!cell) {
      return { volatilityDescription: undefined, impactLevel: undefined };
    }
    const volatility = cell.getAttribute('title')?.trim();
    const impactNum = cell.querySelectorAll('i.grayFullBullishIcon').length;

    let impactLevel: EconomicImpactLevel | undefined;
    if (impactNum === 1) {
      impactLevel = EconomicImpactLevel.LOW;
    } else if (impactNum === 2) {
      impactLevel = EconomicImpactLevel.MEDIUM;
    } else if (impactNum >= 3) {
      impactLevel = EconomicImpactLevel.HIGH;
    }

    return {
      volatilityDescription: volatility && volatility !== 'N/A' ? volatility : undefined,
      impactLevel,
    };
  }
}
