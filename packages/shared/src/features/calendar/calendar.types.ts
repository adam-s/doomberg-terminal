// Calendar event types and enums for economic and earnings events

export enum CalendarEventType {
  ECONOMIC = 'economic',
  EARNINGS = 'earnings',
}

export enum EconomicImpactLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
}

export enum EarningsReportingTime {
  BMO = 'Before Market Open',
  AMC = 'After Market Close',
  DMT = 'During Market Trading',
  TBD = 'To Be Determined',
  NONE = 'Not Specified',
}

export enum DaySelection {
  TODAY = 'today',
  TOMORROW = 'tomorrow',
}

export interface IBaseCalendarEvent {
  id: string;
  eventType: CalendarEventType;
  eventDate: string;
  eventTimestamp: number;
  country: string;
  sourceProvider?: string;
  sourceProviderUrl?: string;
  originalEventId?: string;
  detailsPageUrl?: string;
  retrievedTimestamp: number;
  lastModifiedTimestamp?: number;
  notes?: string;
}

export interface IEconomicCalendarEvent extends IBaseCalendarEvent {
  eventType: CalendarEventType.ECONOMIC;
  time: string;
  currency: string;
  eventName: string;
  volatilityDescription?: string;
  impactLevel?: EconomicImpactLevel;
  actualValue: string | null;
  forecastValue: string | null;
  previousValue: string | null;
}

export interface IEarningsCalendarEvent extends IBaseCalendarEvent {
  eventType: CalendarEventType.EARNINGS;
  companyShortName: string;
  companyFullName: string;
  tickerSymbol: string;
  exchange?: string;
  epsActual: string | null;
  epsForecast: string | null;
  revenueActual: string | null;
  revenueForecast: string | null;
  marketCap: string | null;
  reportingTime: EarningsReportingTime;
  reportingTimeDescription?: string;
  fiscalPeriod?: string;
}

export type ICalendarEventModel = IEconomicCalendarEvent | IEarningsCalendarEvent;
