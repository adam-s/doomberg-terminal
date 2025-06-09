import { useState, useEffect } from 'react';
import { autorun, IReader } from 'vs/base/common/observable';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { useService } from './useService';
import { ICalendarService } from '@shared/features/calendar/calendar.service';
import {
  ICalendarEventModel,
  CalendarEventType,
  DaySelection,
} from '@shared/features/calendar/calendar.types';

export interface UseCalendarOptions {
  day: DaySelection;
  eventType?: CalendarEventType;
}

export function useCalendar(options: UseCalendarOptions): ICalendarEventModel[] | undefined {
  const { day, eventType } = options;
  const [events, setEvents] = useState<ICalendarEventModel[] | undefined>(undefined);
  const calendarService = useService(ICalendarService);

  useEffect(() => {
    const disposables = new DisposableStore();
    const resolvedEventType: CalendarEventType = eventType ?? CalendarEventType.ECONOMIC;

    // start test output to console
    // as a test get events for tomorrow and log them to console here
    (async () => {
      try {
        const todaysEvents = await calendarService.getTodaysEvents(resolvedEventType);
        console.log("Today's Events:", todaysEvents);

        const tomorrowsEvents = await calendarService.getTomorrowsEvents(resolvedEventType);
        console.log("Tomorrow's Events:", tomorrowsEvents);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
      }
    })();
    // end test output to console

    const observable = calendarService.getEventsForDayObservable(day, resolvedEventType);
    setEvents(observable.get());
    disposables.add(
      autorun((reader: IReader) => {
        setEvents(observable.read(reader));
      }),
    );
    return () => {
      disposables.dispose();
    };
  }, [calendarService, day, eventType]);

  return events;
}
