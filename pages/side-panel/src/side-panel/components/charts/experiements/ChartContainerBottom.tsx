import { makeStyles, tokens, Tab, TabList } from '@fluentui/react-components';
import {
  DataBarVerticalRegular,
  DataHistogramRegular,
  DataPieRegular,
  DataTrendingRegular,
  TimelineRegular,
} from '@fluentui/react-icons';
import React from 'react';
import { LagChartStack } from './LagChartStack';
import { InteractiveLagChart } from './InteractiveLagChart';

const chartTabs = [
  { id: 'line', name: 'Line', icon: <DataTrendingRegular /> },
  { id: 'bar', name: 'Bar', icon: <DataBarVerticalRegular /> },
  { id: 'pie', name: 'Pie', icon: <DataPieRegular /> },
  { id: 'histogram', name: 'Histogram', icon: <DataHistogramRegular /> },
  { id: 'timeline', name: 'Timeline', icon: <TimelineRegular /> },
];

const useStyles = makeStyles({
  chartContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    minHeight: 0,
    minWidth: 0,
  },

  tabList: {},
  chartContent: {
    flexGrow: 1,
    padding: '4px', // Reduced padding
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
  },
  chartItem: {
    flex: 1, // Make each chart take equal space
    minHeight: 0, // Important for proper sizing
  },
  centeredText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground2,
  },
});

export const ChartContainerBottom: React.FC = () => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = React.useState('line');

  const renderChartContent = () => {
    switch (selectedTab) {
      case 'line':
        return <LagChartStack />;
      case 'bar':
        return <InteractiveLagChart />;
      default:
        return <div className={styles.centeredText}>Chart type: {selectedTab}</div>;
    }
  };

  return (
    <div className={styles.chartContainer}>
      <TabList
        size="small"
        selectedValue={selectedTab}
        onTabSelect={(_, data) => setSelectedTab(data.value as string)}
        className={styles.tabList}>
        {chartTabs.map(tab => (
          <Tab key={tab.id} value={tab.id} icon={tab.icon} />
        ))}
      </TabList>
      <div className={styles.chartContent}>{renderChartContent()}</div>
    </div>
  );
};
