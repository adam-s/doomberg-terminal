import { ILogService } from '@shared/services/log.service';
import {
  type IEarningsCalendarEvent,
  CalendarEventType,
  EarningsReportingTime,
} from '@shared/features/calendar/calendar.types';

/**
 * Represents the data structure for an earnings event as parsed from the source,
 * before it's fully transformed into the IEarningsCalendarEvent domain model.
 */
export type ParsedEarningsEventData = Omit<
  IEarningsCalendarEvent,
  'id' | 'retrievedTimestamp' | 'lastModifiedTimestamp' | 'notes' | 'fiscalPeriod' // fiscalPeriod is not in the HTML
>;

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cleanText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) {
    return null;
  }
  const cleaned = text.trim();
  return cleaned === '--' || cleaned === '' ? null : cleaned;
}

export class EarningsCalendarParser {
  public constructor(private readonly _logService: ILogService) {}

  public get timezoneFormat(): string {
    return this._getTimezoneFormat();
  }

  private _getTimezoneOffset(date: Date): number {
    // Create a date in Eastern Time to check if it's in DST
    const easternTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const utcTime = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));

    // Calculate the offset in minutes
    const offsetMinutes = (utcTime.getTime() - easternTime.getTime()) / (1000 * 60);
    return offsetMinutes;
  }

  private _getTimezoneFormat(): string {
    const now = new Date();
    const offsetMinutes = this._getTimezoneOffset(now);
    const isDST = offsetMinutes === -240; // EDT is UTC-4 (-240 minutes)

    if (isDST) {
      return '(GMT -4:00)'; // Eastern Daylight Time
    } else {
      return '(GMT -5:00)'; // Eastern Standard Time
    }
  }

  private _adjustDateForTimezone(date: Date): Date {
    // Get the current timezone offset for the given date
    const offsetMinutes = this._getTimezoneOffset(date);
    const adjustedTime = date.getTime() + offsetMinutes * 60 * 1000;
    return new Date(adjustedTime);
  }

  private _parseMarketCap(marketCapString: string | null): number | null {
    if (!marketCapString) {
      return null;
    }
    // Normalize string, e.g. remove commas if any
    const cleanedString = marketCapString.trim().replace(/,/g, '');
    if (cleanedString === '--' || cleanedString === '') {
      return null;
    }

    const lastChar = cleanedString.slice(-1).toUpperCase();
    let multiplier = 1;
    let numStr = cleanedString;

    if (lastChar === 'T') {
      multiplier = 1_000_000_000_000;
      numStr = cleanedString.slice(0, -1);
    } else if (lastChar === 'B') {
      multiplier = 1_000_000_000;
      numStr = cleanedString.slice(0, -1);
    } else if (lastChar === 'M') {
      multiplier = 1_000_000;
      numStr = cleanedString.slice(0, -1);
    }

    const num = parseFloat(numStr);
    if (isNaN(num)) {
      this._logService.warn(
        `[EarningsCalendarParser] Could not parse market cap value from string: "${marketCapString}" (parsed as "${numStr}")`,
      );
      return null;
    }
    return num * multiplier;
  }

  private _parseDocument(html: string): Document {
    return new DOMParser().parseFromString(
      `<table><tbody>${html.trim()}</tbody></table>`,
      'text/html',
    );
  }

  public parseCalendar(rowsHtml: string, minMarketCap?: number): ParsedEarningsEventData[] {
    const doc = this._parseDocument(rowsHtml);
    const allParsedEvents: ParsedEarningsEventData[] = [];
    let currentEventDate: string | null = null;
    let currentEventTimestamp: number | null = null;

    const rows = doc.querySelectorAll('tbody > tr');

    for (const row of Array.from(rows)) {
      const dayCell = row.querySelector('td.theDay');
      if (dayCell) {
        const displayDateText = dayCell.textContent?.trim();
        if (!displayDateText) {
          this._logService.warn('[EarningsCalendarParser] Day header cell missing text content', {
            cellOuterHtml: dayCell.outerHTML,
          });
          currentEventDate = null;
          currentEventTimestamp = null;
          continue;
        }

        try {
          const dateObj = new Date(displayDateText);
          if (isNaN(dateObj.getTime())) {
            this._logService.warn('[EarningsCalendarParser] Invalid date from day header', {
              displayDateText,
            });
            currentEventDate = null;
            currentEventTimestamp = null;
            continue;
          }

          // Apply timezone adjustment to the day header date
          const adjustedDateObj = this._adjustDateForTimezone(dateObj);
          currentEventDate = formatYMD(adjustedDateObj);
          currentEventTimestamp = adjustedDateObj.getTime();
        } catch (error) {
          this._logService.error('[EarningsCalendarParser] Error parsing day header date', {
            displayDateText,
            error,
          });
          currentEventDate = null;
          currentEventTimestamp = null;
        }
      } else if (
        currentEventDate &&
        currentEventTimestamp &&
        row.querySelector('td.earnCalCompany')
      ) {
        // This looks like an event row
        const parseResult = this._parseEventRow(row, currentEventDate, currentEventTimestamp);
        if (parseResult) {
          const { event: parsedEvent, numericalMarketCap } = parseResult;
          if (
            minMarketCap !== undefined &&
            numericalMarketCap !== null &&
            numericalMarketCap < minMarketCap
          ) {
            this._logService.trace(
              `[EarningsCalendarParser] Skipping event ${
                parsedEvent.tickerSymbol || parsedEvent.companyShortName
              } due to market cap ${numericalMarketCap} < ${minMarketCap}`,
              { event: parsedEvent.companyShortName, numericalMarketCap },
            );
            // Skip this event
          } else {
            allParsedEvents.push(parsedEvent);
          }
        }
      } else if (row.querySelector('td.earnCalCompany')) {
        this._logService.warn(
          '[EarningsCalendarParser] Encountered event row without preceding valid day header. Skipping event.',
          { rowOuterHtml: row.outerHTML.substring(0, 100) + '...' },
        );
      } else {
        this._logService.trace('[EarningsCalendarParser] Skipping unrecognized row', {
          rowOuterHtml: row.outerHTML.substring(0, 100) + '...',
        });
      }
    }

    return allParsedEvents;
  }

  private _getReportingTime(timeCell: Element | null): {
    reportingTime: EarningsReportingTime;
    reportingTimeDescription?: string;
  } {
    if (!timeCell) {
      return { reportingTime: EarningsReportingTime.TBD };
    }

    const dataValue = timeCell.getAttribute('data-value');
    const tooltipSpan = timeCell.querySelector('span.genToolTip');
    const tooltipText = tooltipSpan?.getAttribute('data-tooltip')?.trim();

    let reportingTime: EarningsReportingTime;
    switch (dataValue) {
      case '1':
        reportingTime = EarningsReportingTime.BMO;
        break;
      case '3':
        reportingTime = EarningsReportingTime.AMC;
        break;
      case '2': // Can be "During market hours" or unspecified.
      default:
        if (tooltipText && /during market/i.test(tooltipText)) {
          reportingTime = EarningsReportingTime.DMT;
        } else {
          reportingTime = EarningsReportingTime.TBD;
        }
        break;
    }
    return {
      reportingTime,
      reportingTimeDescription: tooltipText && tooltipText !== '' ? tooltipText : undefined,
    };
  }

  private _parseEventRow(
    row: Element,
    eventDate: string,
    eventTimestamp: number,
  ): { event: ParsedEarningsEventData; numericalMarketCap: number | null } | null {
    try {
      const companyCell = row.querySelector('td.left.noWrap.earnCalCompany');
      if (!companyCell) {
        this._logService.warn('[EarningsCalendarParser] Event row missing company cell', {
          rowOuterHtml: row.outerHTML,
        });
        return null;
      }

      const companyFullName = companyCell.getAttribute('title')?.trim() || 'N/A';
      const companyShortNameElement = companyCell.querySelector('span.earnCalCompanyName');
      const companyShortName = companyShortNameElement?.textContent?.trim() || companyFullName;

      const anchorElement = companyCell.querySelector('a.bold.middle');
      const tickerSymbol = anchorElement?.textContent?.trim() || 'N/A';
      let detailsPageUrl = anchorElement?.getAttribute('href') || undefined;
      if (detailsPageUrl && detailsPageUrl.startsWith('/')) {
        detailsPageUrl = `https://www.investing.com${detailsPageUrl}`;
      }

      const countrySpan = row.querySelector('td.flag span.ceFlags');
      const country = countrySpan?.getAttribute('title')?.trim() || 'N/A';

      let originalEventId: string | undefined;
      const alertCell = row.querySelector('td.alert.js-injected-user-alert-container');
      if (alertCell) {
        originalEventId = alertCell.getAttribute('data-pair-id')?.trim();
      }
      if (!originalEventId) {
        const allTds = Array.from(row.querySelectorAll('td'));
        const lastTdWithPairId = allTds.reverse().find(td => td.hasAttribute('data-pair-id'));
        if (lastTdWithPairId) {
          originalEventId = lastTdWithPairId.getAttribute('data-pair-id')?.trim();
        }
      }
      if (!originalEventId) {
        originalEventId = companyCell.getAttribute('_p_pid')?.trim();
      }
      if (!originalEventId) {
        const epsCellWithPid = row.querySelector('td[class*="-eps_actual"]');
        if (epsCellWithPid) {
          const classMatch = epsCellWithPid.className.match(/pid-(\d+)-/);
          if (classMatch && classMatch[1]) {
            originalEventId = classMatch[1];
          }
        }
      }

      const epsActualCell = row.querySelector('td[class*="-eps_actual"]');
      const epsActual = cleanText(epsActualCell?.textContent);
      const epsForecast = cleanText(
        epsActualCell?.nextElementSibling?.textContent?.split('/').pop(),
      );

      const revenueActualCell = row.querySelector('td[class*="-rev_actual"]');
      const revenueActual = cleanText(revenueActualCell?.textContent);
      const revenueForecast = cleanText(
        revenueActualCell?.nextElementSibling?.textContent?.split('/').pop(),
      );

      const timeCell = row.querySelector('td.right.time');
      const marketCapText = cleanText(timeCell?.previousElementSibling?.textContent);
      const numericalMarketCap = this._parseMarketCap(marketCapText);

      const { reportingTime, reportingTimeDescription } = this._getReportingTime(timeCell);

      const parsedEventData: ParsedEarningsEventData = {
        eventType: CalendarEventType.EARNINGS,
        eventDate: eventDate,
        eventTimestamp: eventTimestamp,
        country,
        companyShortName,
        companyFullName,
        tickerSymbol,
        detailsPageUrl,
        originalEventId,
        sourceProvider: undefined,
        sourceProviderUrl: undefined,
        epsActual,
        epsForecast,
        revenueActual,
        revenueForecast,
        marketCap: marketCapText,
        reportingTime,
        reportingTimeDescription,
        exchange: undefined,
      };
      return { event: parsedEventData, numericalMarketCap };
    } catch (error: unknown) {
      this._logService.error('[EarningsCalendarParser] Error parsing event row:', {
        error,
        rowOuterHtml: row.outerHTML.substring(0, 500), // Log a portion of the row
      });
      return null;
    }
  }
}
