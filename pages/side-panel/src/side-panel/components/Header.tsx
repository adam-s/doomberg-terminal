import React from 'react';
import {
  makeStyles,
  tokens,
  TabList,
  Tab,
  type SelectTabData,
  type SelectTabEvent,
  type TabValue,
  CounterBadge,
} from '@fluentui/react-components';
import { SimulationSummaryWidget } from './tradeSimulator/SimulationSummaryWidget';
import { Settings } from './settings/Settings';
import { useTabNavigationContext } from '../context/TabNavigationContext';
import { type PageType } from '../hooks/useTabNavigation';
import { useNewsAlerts } from '../hooks/useNewsAlerts';

const BREAKPOINTS = {
  MOBILE: '300px',
  TABLET: '600px',
  DESKTOP: '900px',
} as const;

const useClasses = makeStyles({
  root: {
    height: '48px',
    lineHeight: '48px',
    display: 'flex',
  },
  headerLeftRegion: {
    height: '100%',
    textAlign: 'center',
  },
  headerRightRegion: {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center', // Align items vertically
    overflow: 'hidden', // Hide overflow
    minWidth: 0, // Allow the container to shrink
  },
  menuNavContainer: {
    display: 'flex',
    lineHeight: '48px',
    height: '100%',
    '&:active': {
      background: tokens.colorBrandBackgroundHover,
    },
  },
  menuNavButton: {
    border: '0px',
    borderRadius: '0px',
    minWidth: '48px',
    height: '48px',
    '&:hover': {
      background: tokens.colorBrandBackgroundHover,
    },
  },
  menuIcon: {
    display: 'inline-block',
    fontSize: '16px',
    color: 'white',
  },
  switch: {
    // Base styles for the switch
    alignItems: 'center',
  },
  switchIndicator: {
    // Styles when the switch is checked (active)
    '& .fui-Switch__input:enabled:checked ~ .fui-Switch__indicator': {
      color: tokens.colorNeutralForeground1,
      '& svg': {},
    },
    // Styles when the switch is unchecked (inactive)
    '& .fui-Switch__input:enabled:not(:checked) ~ .fui-Switch__indicator': {
      '& svg': {},
    },
  },
  // Style for the SimulationSummaryWidget container
  simulationSummaryContainer: {
    display: 'none', // Hide by default on smaller screens
    [`@media (min-width: ${BREAKPOINTS.DESKTOP})`]: {
      display: 'flex', // Show on tablet and larger screens
      alignItems: 'center', // Ensure vertical alignment matches parent
    },
  },
  newsTabContainer: {},
  newsBadge: {
    position: 'absolute',
    top: '2px', // Adjust as needed for visual alignment
    right: '2px', // Adjust as needed for visual alignment
    zIndex: 1,
  },
});

// Remove props from HeaderProps
// type HeaderProps = {
//   currentPageValue: unknown;
//   setCurrentPageValue: React.Dispatch<unknown>;
// };

// export const Header: React.FC<HeaderProps> = ({ currentPageValue, setCurrentPageValue }) => { // REMOVE props
export const Header: React.FC = () => {
  const classes = useClasses();
  const { currentPage, navigateTo } = useTabNavigationContext();
  const { unreadCount, resetCount } = useNewsAlerts();

  // Set Main as default on mount if no page is set (though TabNavigationProvider sets initialPage)
  React.useEffect(() => {
    // The TabNavigationProvider already sets an initialPage.
    // This effect might be redundant or could be adjusted if specific default logic is needed
    // beyond the initialPage of the provider.
    // For now, let's assume initialPage from provider is sufficient.
    // If you still need to default to 'main' under certain conditions:
    if (!currentPage) {
      navigateTo('main');
    }
  }, [currentPage, navigateTo]);

  const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    const page = data.value as PageType;
    navigateTo(page);

    if (page === 'news' && unreadCount > 0) {
      resetCount();
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.headerRightRegion}>
        <TabList selectedValue={currentPage as TabValue} onTabSelect={onTabSelect}>
          <Tab value="main">Main</Tab>
          <Tab value="tradeSimulator">Sim</Tab>
          <Tab value="news">
            <div className={classes.newsTabContainer}>
              News
              <CounterBadge
                count={unreadCount} // Dynamic count from useNewsAlerts hook
                appearance="filled"
                color="danger"
                size="small"
                className={classes.newsBadge}
              />
            </div>
          </Tab>
          <Tab value="chat">Chat</Tab>
          <Tab value="chatgpt">ChatGPT</Tab>
        </TabList>
        <div className={classes.simulationSummaryContainer}>
          <SimulationSummaryWidget />
        </div>
      </div>
      <div className={classes.headerLeftRegion}>
        <div className={classes.menuNavContainer}>
          <Settings />
        </div>
      </div>
    </div>
  );
};
