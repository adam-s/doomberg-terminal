import {
  ICalendarEventModel,
  IEconomicCalendarEvent,
  IEarningsCalendarEvent,
  CalendarEventType,
  EconomicImpactLevel,
  EarningsReportingTime,
} from './calendar.types';

export class CalendarValidationError extends Error {
  public readonly errors: string[];

  public constructor(errors: string[]) {
    super(`Calendar event validation failed: ${errors.join('; ')}`);
    this.errors = errors;
    this.name = 'CalendarValidationError';
    Object.setPrototypeOf(this, CalendarValidationError.prototype);
  }
}

export class CalendarValidator {
  public static validate(event: Partial<ICalendarEventModel>, isNew: boolean): void {
    const errors: string[] = [];
    this.validateBaseEvent(event, isNew, errors);
    if (event.eventType === CalendarEventType.ECONOMIC) {
      this.validateEconomicEvent(event as Partial<IEconomicCalendarEvent>, isNew, errors);
    } else if (event.eventType === CalendarEventType.EARNINGS) {
      this.validateEarningsEvent(event as Partial<IEarningsCalendarEvent>, isNew, errors);
    } else if (isNew || event.eventType !== undefined) {
      errors.push('eventType is required and must be a valid CalendarEventType.');
    }
    if (errors.length > 0) {
      throw new CalendarValidationError(errors);
    }
  }

  private static validateBaseEvent(
    event: Partial<ICalendarEventModel>,
    isNew: boolean,
    errors: string[],
  ): void {
    if (isNew || event.eventDate !== undefined) {
      if (!event.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) {
        errors.push('eventDate is required and must be in YYYY-MM-DD format.');
      }
    }
    if (isNew || event.eventTimestamp !== undefined) {
      if (typeof event.eventTimestamp !== 'number' || event.eventTimestamp <= 0) {
        errors.push('eventTimestamp is required and must be a positive number.');
      }
    }
    if (isNew || event.country !== undefined) {
      if (!event.country || event.country.trim() === '') {
        errors.push('country is required and cannot be empty.');
      }
    }
    if (event.retrievedTimestamp !== undefined && typeof event.retrievedTimestamp !== 'number') {
      errors.push('retrievedTimestamp must be a number.');
    }
    if (
      event.lastModifiedTimestamp !== undefined &&
      typeof event.lastModifiedTimestamp !== 'number'
    ) {
      errors.push('lastModifiedTimestamp must be a number.');
    }
    if (event.sourceProviderUrl !== undefined && typeof event.sourceProviderUrl !== 'string') {
      errors.push('sourceProviderUrl must be a string if provided.');
    }
  }

  private static validateEconomicEvent(
    event: Partial<IEconomicCalendarEvent>,
    isNew: boolean,
    errors: string[],
  ): void {
    if (isNew || event.time !== undefined) {
      if (!event.time || event.time.trim() === '') {
        errors.push('Economic event: time is required.');
      }
    }
    if (isNew || event.currency !== undefined) {
      if (!event.currency || event.currency.trim() === '') {
        errors.push('Economic event: currency is required.');
      }
    }
    if (isNew || event.eventName !== undefined) {
      if (!event.eventName || event.eventName.trim() === '') {
        errors.push('Economic event: eventName is required.');
      }
    }
    if (
      event.impactLevel !== undefined &&
      !Object.values(EconomicImpactLevel).includes(event.impactLevel as EconomicImpactLevel)
    ) {
      errors.push('Economic event: impactLevel is not a valid EconomicImpactLevel.');
    }
    if (
      event.actualValue !== undefined &&
      typeof event.actualValue !== 'string' &&
      event.actualValue !== null
    ) {
      errors.push('Economic event: actualValue must be a string or null.');
    }
    if (
      event.forecastValue !== undefined &&
      typeof event.forecastValue !== 'string' &&
      event.forecastValue !== null
    ) {
      errors.push('Economic event: forecastValue must be a string or null.');
    }
    if (
      event.previousValue !== undefined &&
      typeof event.previousValue !== 'string' &&
      event.previousValue !== null
    ) {
      errors.push('Economic event: previousValue must be a string or null.');
    }

    // Validate consistency of eventTimestamp, eventDate, and time
    if (
      typeof event.eventTimestamp === 'number' &&
      typeof event.eventDate === 'string' &&
      typeof event.time === 'string'
    ) {
      const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
      if (timeRegex.test(event.time)) {
        const expectedTimestamp = new Date(`${event.eventDate}T${event.time}`).getTime();
        if (!isNaN(expectedTimestamp) && expectedTimestamp !== event.eventTimestamp) {
          errors.push(
            `Economic event: eventTimestamp (${event.eventTimestamp}) does not match eventDate (${event.eventDate}) and time (${event.time}). Expected ${expectedTimestamp}.`,
          );
        }
      }
    }
  }

  private static validateEarningsEvent(
    event: Partial<IEarningsCalendarEvent>,
    isNew: boolean,
    errors: string[],
  ): void {
    if (isNew || event.companyShortName !== undefined) {
      if (!event.companyShortName || event.companyShortName.trim() === '') {
        errors.push('Earnings event: companyShortName is required.');
      }
    }
    if (isNew || event.companyFullName !== undefined) {
      if (!event.companyFullName || event.companyFullName.trim() === '') {
        errors.push('Earnings event: companyFullName is required.');
      }
    }
    if (isNew || event.tickerSymbol !== undefined) {
      if (!event.tickerSymbol || event.tickerSymbol.trim() === '') {
        errors.push('Earnings event: tickerSymbol is required.');
      }
    }
    if (isNew || event.reportingTime !== undefined) {
      if (
        !event.reportingTime ||
        !Object.values(EarningsReportingTime).includes(event.reportingTime as EarningsReportingTime)
      ) {
        errors.push(
          'Earnings event: reportingTime is required and must be a valid EarningsReportingTime.',
        );
      }
    }
    const fieldsToValidateNullableString: (keyof IEarningsCalendarEvent)[] = [
      'epsActual',
      'epsForecast',
      'revenueActual',
      'revenueForecast',
      'marketCap',
    ];
    fieldsToValidateNullableString.forEach(field => {
      if (event[field] !== undefined && typeof event[field] !== 'string' && event[field] !== null) {
        errors.push(`Earnings event: ${field} must be a string or null.`);
      }
    });
  }
}
