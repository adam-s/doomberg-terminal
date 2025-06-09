import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  makeStyles,
  shorthands,
  Text,
  Card,
  CardHeader,
  Badge,
  tokens,
  Body1,
  Caption1,
  CardFooter,
  Button, // Added
} from '@fluentui/react-components';
import {
  Open20Regular,
  ArrowSync20Regular,
  Search12Regular,
  Link20Regular,
} from '@fluentui/react-icons'; // Changed Search20Regular to Search16Regular
import { useCalendar } from '../../hooks/useCalendar';
import {
  CalendarEventType,
  ICalendarEventModel,
  IEconomicCalendarEvent,
  DaySelection,
} from '@shared/features/calendar/calendar.types';
import { DarkScrollContainer } from '../common/DarkScrollContainer';
import { useTextStyles } from '../common/textStyles';
// import { VirtualizerScrollView, type ScrollToInterface } from '@fluentui/react-components/unstable'; // Remove old import
import {
  VirtualizerScrollViewDynamic,
  type ScrollToInterface,
} from '@fluentui/react-components/unstable'; // Add new imports
import { useTabNavigationContext } from '@src/side-panel/context/TabNavigationContext';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    padding: '10px',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    gap: tokens.spacingHorizontalS, // Add a gap between the title text and buttons
  },
  calendarTitleHeader: {
    // This class will be combined with textStyles.symbolText
    // It adds flex properties to ensure consistent height and alignment
    display: 'flex',
    alignItems: 'center', // Vertically align text and buttons
    justifyContent: 'space-between', // Space between title and buttons
  },
  dayOptionButton: {
    background: 'none',
    border: 'none',
    padding: 0, // Remove default button padding
    // margin is handled by the parent's gap property
    fontSize: '12px', // As per original
    fontFamily: 'inherit', // As per original
    cursor: 'pointer', // As per original
    lineHeight: 'normal', // Ensure button line height doesn't cause issues
  },
  refreshIconButton: {
    // Core properties from dayOptionButton
    background: 'none',
    border: 'none',
    padding: 0, // Match dayOptionButton
    fontSize: '12px', // Match dayOptionButton
    fontFamily: 'inherit', // Match dayOptionButton
    cursor: 'pointer', // Match dayOptionButton
    lineHeight: 'normal', // Match dayOptionButton

    // Color properties specific to this button
    color: tokens.colorNeutralForeground2,
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },

    // Layout for the icon
    minWidth: 'auto',
    display: 'inline-flex', // Helps center the icon
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle', // Align with adjacent text if any (though here it's in a flex row)
  },
  header: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#777',
    marginBottom: '8px',
  },
  virtualizerContainer: {
    flex: 1,
    minHeight: 0,
  },
  eventItem: {
    margin: '8px 0',
    width: '100%',
    boxSizing: 'border-box',
    position: 'relative', // Good for establishing a positioning context
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out', // Moved from eventCard
    // Apply hover effects to the entire item container
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow16,
    },
  },
  eventCard: {
    display: 'grid',
    gridTemplateRows: 'auto auto auto', // Adjusted for new economic data section
    ...shorthands.gap(tokens.spacingVerticalS),
    width: '100%',
    cursor: 'pointer',
    // transition and hover effects removed from here
    // The Card's appearance="filled-alternative" will provide its background
  },
  eventCardHeaderContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  titleSection: {
    flex: 1,
    minWidth: 0,
  },
  openLinkButton: {
    // Added style for the link button
    flexShrink: 0,
    marginLeft: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },
  },
  sourceLinkButton: {
    // Style for the original source link button
    flexShrink: 0,
    marginLeft: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },
  },
  eventTime: {
    color: tokens.colorNeutralForeground2,
  },
  eventTypeBadge: {
    // Ensure this class doesn't conflict with style props, e.g., for margins
    marginRight: tokens.spacingHorizontalXS,
  },
  economicDataSection: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.padding(0, tokens.spacingHorizontalM), // Add horizontal padding
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  economicDataRow: {
    display: 'flex',
    justifyContent: 'space-between', // Distribute columns evenly
    alignItems: 'flex-start', // Align items at the top of the column
    width: '100%',
  },
  economicDataColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center', // Center text within each column
    flex: 1, // Allow columns to share space equally
    textAlign: 'center',
  },
  economicDataLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalXXS,
  },
  economicDataValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  calendarCardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `0 0 ${tokens.spacingVerticalS}`, // Add some padding if gap is not enough or for style
    gap: tokens.spacingHorizontalXS, // Added gap for badges
  },
  loadingText: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    marginTop: tokens.spacingVerticalL,
  },
  noEventsText: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    marginTop: tokens.spacingVerticalL,
  },
  eventSeparatorLine: {
    borderTop: `1px solid ${tokens.colorNeutralForeground1}`, // White line
    // This border is on the eventItem. When eventItem transforms, the border moves with it.
    // The eventItem's margin (8px 0) provides space around this line.
  },
});
export declare type VirtualizerDataRef = {
  progressiveSizes: React.RefObject<number[]>;
  nodeSizes: React.RefObject<number[]>;
  setFlaggedIndex: (index: number | null) => void;
  currentIndex: React.RefObject<number>;
};

// Define constants for height estimation
const BASE_CARD_HEIGHT = 90; // Estimated height for a non-economic card (header, footer, padding, etc.)
const ECONOMIC_DATA_SECTION_HEIGHT = 70; // Estimated additional height for the economic data section
const DEFAULT_ESTIMATED_EVENT_ITEM_HEIGHT = 130; // Fallback/average height for the virtualizer's itemSize prop

interface BadgeStyleProps {
  appearance: 'filled' | 'outline';
  style?: React.CSSProperties;
}

const getEventTypeBadgeStyleProps = (eventType: CalendarEventType): BadgeStyleProps => {
  if (eventType === CalendarEventType.ECONOMIC) {
    return {
      appearance: 'filled',
      style: {
        backgroundColor: tokens.colorPaletteBlueBackground2, // Using a blue for economic events
        color: tokens.colorNeutralForegroundInverted, // White text for contrast
        fontWeight: tokens.fontWeightSemibold,
      },
    };
  } else {
    // For EARNINGS or other non-economic types, use a neutral outline style
    return {
      appearance: 'outline',
      // No specific style overrides needed to match NewsMain's impact badge (default outline styling)
    };
  }
};

const getEventTime = (event: ICalendarEventModel): string => {
  if (event.eventType === CalendarEventType.ECONOMIC) {
    return (event as IEconomicCalendarEvent).time || 'N/A';
  } else {
    return event.reportingTimeDescription || 'N/A';
  }
};

const getEventTitle = (event: ICalendarEventModel): string => {
  if (event.eventType === CalendarEventType.ECONOMIC) {
    return (event as IEconomicCalendarEvent).eventName || 'Economic Event';
  } else {
    return event.companyShortName || event.tickerSymbol || 'Earnings Event';
  }
};

const openLink = (url: string | undefined): void => {
  if (!url || !chrome?.tabs) {
    return;
  }

  // Check if the URL is already open in a tab
  chrome.tabs.query({ url }, existingTabs => {
    if (existingTabs && existingTabs.length > 0) {
      // URL is already open, navigate to the first matching tab
      const existingTab = existingTabs[0];
      if (existingTab.id !== undefined) {
        chrome.tabs.update(existingTab.id, { active: true });
        // Also focus the window containing the tab
        if (existingTab.windowId !== undefined) {
          chrome.windows.update(existingTab.windowId, { focused: true });
        }
      }
    } else {
      // URL is not open, create a new tab
      chrome.tabs.create({
        url,
        active: true,
      });
    }
  });
};

const isInvestingComUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const urlObject = new URL(url);
    return urlObject.hostname.includes('investing.com');
  } catch {
    return false;
  }
};

const formatEventTimeDisplay = (
  event: ICalendarEventModel,
  currentTime: number,
  selectedDay: DaySelection,
): string => {
  const eventTs = event.eventTimestamp;
  const staticEventTime = getEventTime(event);

  if (!eventTs) {
    return staticEventTime; // Fallback to static time if timestamp is missing
  }

  if (selectedDay === DaySelection.TOMORROW) {
    return staticEventTime;
  }

  // For DaySelection.TODAY
  const diffMs = eventTs - currentTime;

  if (diffMs < 0) {
    // Event is in the past
    return staticEventTime;
  } else {
    // Event is in the future (or now)
    const diffSeconds = Math.round(diffMs / 1000); // Total seconds until event
    const diffMins = Math.round(diffSeconds / 60); // Total minutes until event, rounded
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60)); // Total full hours until event

    if (diffHours >= 1) {
      // Future event, 1 hour or more away
      return staticEventTime;
    } else {
      // Future event, less than 1 hour away
      if (diffMins <= 0) {
        // Changed from diffMins === 0 to handle cases where it might be slightly negative due to rounding if event is very close
        // Event is within the next minute
        if (diffSeconds <= 5) {
          return 'Now'; // Event is within 5 seconds
        }
        // Display seconds if less than a minute, ensuring it's not 0s from rounding if diffMins was 0.
        return diffSeconds > 0 ? `${diffSeconds}s` : 'Now';
      } else {
        // Event is 1 minute to 59 minutes away
        return `${diffMins}m`;
      }
    }
  }
};

const DAY_OPTIONS = [
  { label: 'Today', value: DaySelection.TODAY },
  { label: 'Tomorrow', value: DaySelection.TOMORROW },
];

export const Calendar: React.FC = () => {
  const styles = useStyles();
  const textStyles = useTextStyles();
  const { navigateTo } = useTabNavigationContext();
  const [selectedDay, setSelectedDay] = useState<DaySelection>(DaySelection.TODAY);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const virtualizerScrollRef = useRef<ScrollToInterface | null>(null);
  const virtualizerDataRef = useRef<VirtualizerDataRef | null>(null);

  const events = useCalendar({
    day: selectedDay,
  });
  const initialScrollPerformedRef = useRef<boolean>(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update current time every 60 seconds

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, []);

  let firstUpcomingEventIndex = -1;
  if (selectedDay === DaySelection.TODAY && events && events.length > 0) {
    // Assuming events are sorted by eventTimestamp
    firstUpcomingEventIndex = events.findIndex(
      event => event.eventTimestamp && event.eventTimestamp >= currentTime,
    );
  }

  useEffect(() => {
    if (
      selectedDay === DaySelection.TODAY &&
      !initialScrollPerformedRef.current &&
      virtualizerScrollRef.current &&
      events &&
      events.length > 0 &&
      firstUpcomingEventIndex > 0 // Ensure there's a separator to scroll to
    ) {
      // Defer the scrollTo call to allow VirtualizerScrollView to process new items
      // This ensures the target item is rendered and available for scrolling.
      const timerId = setTimeout(() => {
        if (virtualizerScrollRef.current) {
          // Re-check ref in case component unmounted
          try {
            virtualizerScrollRef.current.scrollTo(firstUpcomingEventIndex, 'smooth');
            initialScrollPerformedRef.current = true;
          } catch (error) {
            console.error('Error during scrollTo:', error);
          }
        }
      }, 0); // Delay of 0ms pushes execution to the next event loop tick

      return () => clearTimeout(timerId); // Cleanup timeout
    }
    return undefined; // No cleanup needed if timeout isn't set
  }, [events, firstUpcomingEventIndex, selectedDay]); // Rerun if these change

  const handleDaySelectionChange = (day: DaySelection) => {
    setSelectedDay(day);
    initialScrollPerformedRef.current = false; // Reset scroll flag when day changes
    // Reset firstUpcomingEventIndex when day changes, it will be recalculated on next render
  };

  const handleRefreshScroll = useCallback(() => {
    if (
      selectedDay === DaySelection.TODAY &&
      virtualizerScrollRef.current &&
      events &&
      events.length > 0 &&
      firstUpcomingEventIndex > -1
    ) {
      try {
        virtualizerScrollRef.current.scrollTo(firstUpcomingEventIndex, 'smooth');
      } catch (error) {
        console.error('Error during manual scrollTo refresh:', error);
      }
    }
  }, [selectedDay, events, firstUpcomingEventIndex]);

  const getItemSizeCallback = useCallback(
    (index: number): number => {
      if (!events || index < 0 || index >= events.length) {
        return DEFAULT_ESTIMATED_EVENT_ITEM_HEIGHT;
      }
      const event = events[index];
      let estimatedHeight = BASE_CARD_HEIGHT;

      if (event.eventType === CalendarEventType.ECONOMIC) {
        estimatedHeight += ECONOMIC_DATA_SECTION_HEIGHT;
      }
      return estimatedHeight;
    },
    [events],
  );

  const renderEventCard = (
    event: ICalendarEventModel,
    index: number,
    totalEvents: number,
    showSeparator: boolean,
  ) => {
    const eventTitle = getEventTitle(event);
    const eventTimeDisplay = formatEventTimeDisplay(event, currentTime, selectedDay);
    const eventTypeBadgeProps = getEventTypeBadgeStyleProps(event.eventType);
    let providerOrCompanyText: string;
    const isEconomicEvent = event.eventType === CalendarEventType.ECONOMIC;
    let impactLevel: number | undefined;
    let economicEventData: IEconomicCalendarEvent | undefined;
    let eventUrl: string | undefined;
    let sourceUrl: string | undefined;

    if (isEconomicEvent) {
      economicEventData = event as IEconomicCalendarEvent;
      const country = economicEventData.country;
      const currency = economicEventData.currency;
      let locationDetails = '';
      if (country && currency) {
        locationDetails = ` (${country} - ${currency})`;
      } else if (country) {
        locationDetails = ` (${country})`;
      } else if (currency) {
        locationDetails = ` (${currency})`;
      }
      providerOrCompanyText = `${economicEventData.sourceProvider || 'Economic Data'}${locationDetails}`;
      impactLevel = economicEventData.impactLevel;
      eventUrl = economicEventData.detailsPageUrl;
      sourceUrl = economicEventData.sourceProviderUrl; // Assuming this is the URL to the event source
    } else {
      providerOrCompanyText = event.companyShortName || event.tickerSymbol || 'Company Event';
      // For non-economic events, there's no direct source URL in the current model
      // eventUrl remains undefined
    }
    const descriptionText = `${providerOrCompanyText} • ${eventTimeDisplay}`;

    const formatEconomicValue = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined || value === '') {
        return '--';
      }
      return String(value);
    };

    return (
      <div
        role="listitem"
        aria-posinset={index + 1}
        aria-setsize={totalEvents}
        key={event.id}
        className={`${styles.eventItem} ${showSeparator ? styles.eventSeparatorLine : ''}`}>
        <Card className={styles.eventCard} appearance="filled-alternative" size="small">
          <CardHeader
            header={
              <div className={styles.eventCardHeaderContent}>
                <div className={styles.titleSection}>
                  <Text weight="semibold" size={300} block>
                    {eventTitle}
                  </Text>
                </div>

                {sourceUrl &&
                  !isInvestingComUrl(sourceUrl) && ( // Conditionally render the original source button
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<Link20Regular />}
                      className={styles.sourceLinkButton}
                      onClick={e => {
                        e.stopPropagation(); // Prevent card click event
                        openLink(sourceUrl);
                      }}
                      aria-label="Open original source in new tab"
                    />
                  )}
                {eventUrl && ( // Conditionally render the event details button
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Open20Regular />}
                    className={styles.openLinkButton}
                    onClick={e => {
                      e.stopPropagation(); // Prevent card click event
                      openLink(eventUrl);
                    }}
                    aria-label="Open event details in new tab"
                  />
                )}
              </div>
            }
            description={<Caption1 className={styles.eventTime}>{descriptionText}</Caption1>}
          />

          {isEconomicEvent && economicEventData && (
            <div className={styles.economicDataSection}>
              <div className={styles.economicDataRow}>
                <div className={styles.economicDataColumn}>
                  <Text className={styles.economicDataLabel}>Previous</Text>
                  <Text className={styles.economicDataValue}>
                    {formatEconomicValue(economicEventData.previousValue)}
                  </Text>
                </div>
                <div className={styles.economicDataColumn}>
                  <Text className={styles.economicDataLabel}>Forecast</Text>
                  <Text className={styles.economicDataValue}>
                    {formatEconomicValue(economicEventData.forecastValue)}
                  </Text>
                </div>
                <div className={styles.economicDataColumn}>
                  <Text className={styles.economicDataLabel}>Actual</Text>
                  <Text className={styles.economicDataValue}>
                    {formatEconomicValue(economicEventData.actualValue)}
                  </Text>
                </div>
              </div>
            </div>
          )}

          <CardFooter className={styles.calendarCardFooter}>
            <div>
              <Badge
                size="small"
                shape="rounded"
                appearance={eventTypeBadgeProps.appearance}
                style={eventTypeBadgeProps.style}
                className={styles.eventTypeBadge}>
                {event.eventType}
              </Badge>
              {isEconomicEvent && impactLevel !== undefined && (
                <Badge size="small" shape="rounded" appearance="outline">
                  Impact: {impactLevel}
                </Badge>
              )}
            </div>
            <Badge
              onClick={e => {
                e.stopPropagation();
                navigateTo('chat', event.id);
              }}
              size="small"
              shape="rounded"
              appearance="outline"
              icon={<Search12Regular />}
              iconPosition="after">
              Analyze
            </Badge>
          </CardFooter>
        </Card>
      </div>
    );
  };

  return (
    <div className={styles.root} data-test-id="calendar-component">
      <div className={`${textStyles.symbolText} ${styles.calendarTitleHeader}`}>
        <span>Calendar Events {events ? `(${events.length} items)` : ''}</span>
        <div>
          {DAY_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={styles.dayOptionButton}
              style={{
                color:
                  selectedDay === option.value ? tokens.colorNeutralForegroundOnBrand : 'inherit', // Inherit color from textStyles.symbolText
              }}
              aria-pressed={selectedDay === option.value}
              tabIndex={0}
              onClick={() => handleDaySelectionChange(option.value)}>
              [{option.label.toLowerCase()}]
            </button>
          ))}
          {/* Analyze Button removed from here */}
          {selectedDay === DaySelection.TODAY &&
            events &&
            events.length > 0 &&
            firstUpcomingEventIndex > -1 && (
              <button
                type="button"
                style={{ width: '14px', height: '14px' }} // Match the size of the icon
                className={styles.refreshIconButton}
                onClick={handleRefreshScroll}
                aria-label="Scroll to current event"
                title="Scroll to current event">
                <ArrowSync20Regular style={{ fontSize: tokens.fontSizeBase200 }} />
              </button>
            )}
        </div>
      </div>

      <DarkScrollContainer
        // ref={scrollContainerRef} // This ref is no longer needed for scroll logic
        className={styles.virtualizerContainer}
        // role, aria-label, and tabIndex will be moved to VirtualizerScrollView's container prop
        style={{ height: '100%', width: '100%' }}>
        {events === undefined && <Body1 className={styles.loadingText}>Loading events...</Body1>}
        {events && events.length === 0 && (
          <Body1 className={styles.noEventsText}>No events scheduled for {selectedDay}.</Body1>
        )}
        {events && events.length > 0 && (
          <VirtualizerScrollViewDynamic
            numItems={events.length}
            itemSize={DEFAULT_ESTIMATED_EVENT_ITEM_HEIGHT} // Use default estimated height
            getItemSize={getItemSizeCallback}
            imperativeRef={virtualizerScrollRef}
            imperativeVirtualizerRef={virtualizerDataRef}
            container={{
              role: 'list',
              'aria-label': `Calendar events list with ${events.length} items`,
              tabIndex: 0,
              style: { height: '100%' }, // Ensure the scroll viewport fills the available space
            }}>
            {(index: number) => {
              const event = events[index];
              const shouldShowSeparator =
                selectedDay === DaySelection.TODAY &&
                index === firstUpcomingEventIndex &&
                firstUpcomingEventIndex > 0; // Only show if it's not the very first event overall
              return renderEventCard(event, index, events.length, shouldShowSeparator);
            }}
          </VirtualizerScrollViewDynamic>
        )}
      </DarkScrollContainer>
    </div>
  );
};
