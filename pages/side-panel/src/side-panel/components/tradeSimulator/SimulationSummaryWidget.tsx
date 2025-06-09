import { Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'; // Import mergeClasses
import React from 'react';
import { Sparkline } from '../charts/Sparkline';
import {
  PanelId,
  useSimulationSummary,
  PositionStatus, // Import PositionStatus
} from '@src/side-panel/hooks/simulation/useSimulationSummary';

// Define chart colors - matching Sentiment chart branding
const COLORS = {
  profit: '#8bd100', // Green
  loss: '#f25022', // Red
  indicator: {
    none: tokens.colorNeutralForegroundDisabled, // Grey
    long: '#8bd100', // Green
    short: '#f25022', // Red
  },
  text: tokens.colorNeutralForeground1, // Default text color
  background: {
    badge: tokens.colorNeutralBackground3,
  },
};

const useStyles = makeStyles({
  widgetContainer: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center', // Vertically center items in the container
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    minHeight: '27px', // Ensure container has some height for centering
    backgroundColor: tokens.colorNeutralBackground3, // Dark background with 60% opacity
    backdropFilter: 'blur(4px)', // Optional: adds a subtle blur effect behind
    borderRadius: tokens.borderRadiusLarge, // Add border radius
    margin: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, // Add margin for spacing
    boxShadow: tokens.shadow4, // Optional: subtle shadow for depth
    border: `3px solid ${tokens.colorNeutralBackground4}`, // Optional: border for separation
  },
  panelSummary: {
    display: 'flex',
    alignItems: 'center', // Vertically center items within the panel summary
    gap: tokens.spacingHorizontalM, // Add gap between indicator and metrics
    paddingLeft: tokens.spacingHorizontalM,
    minWidth: '200px',
  },
  summaryMetrics: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: COLORS.background.badge,
  },
  profit: {
    color: COLORS.profit,
  },
  loss: {
    color: COLORS.loss,
  },
  metricText: {
    fontSize: tokens.fontSizeBase200,
    color: COLORS.text, // Use defined text color
    whiteSpace: 'nowrap', // Prevents text wrapping
    fontVariantNumeric: 'tabular-nums', // Ensures numbers have consistent width
  },
  sparklineContainer: {
    height: '30px', // Reduced height slightly
    width: '75px',
    display: 'flex',
    alignItems: 'center',
  },
  // Styles for the indicator circle
  indicatorCircle: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0, // Prevent circle from shrinking
  },
  indicatorNone: {
    backgroundColor: COLORS.indicator.none,
  },
  indicatorLong: {
    backgroundColor: COLORS.indicator.long,
  },
  indicatorShort: {
    backgroundColor: COLORS.indicator.short,
  },
  metricContainer: {
    minWidth: '75px', // Provides enough space for most values
    display: 'flex',
    justifyContent: 'flex-start',
    fontFamily: tokens.fontFamilyMonospace, // For consistent character widths
  },
});

interface PanelSummaryDisplayProps {
  panelId: PanelId;
}

const PanelSummaryDisplay: React.FC<PanelSummaryDisplayProps> = ({ panelId }) => {
  const styles = useStyles();
  // Get activePositions from the hook
  const { summaries, pnlHistories, activePositions } = useSimulationSummary();
  const summary = summaries[panelId];
  const history = pnlHistories[panelId];
  const positionStatus = activePositions[panelId]; // Get the position status for this panel

  // Determine indicator style based on positionStatus
  const getIndicatorStyle = (status: PositionStatus): string => {
    switch (status) {
      case 'long':
        return styles.indicatorLong;
      case 'short':
        return styles.indicatorShort;
      case 'none':
      default:
        return styles.indicatorNone;
    }
  };

  const indicatorStyle = getIndicatorStyle(positionStatus);

  // Don't render if there's no summary data yet
  if (!summary) {
    return null;
  }

  // Determine P&L class based on the value
  const pnlClass = summary.averagePnL >= 0 ? styles.profit : styles.loss;
  // Determine Sparkline color based on P&L using COLORS constant
  const sparklineColor = summary.averagePnL >= 0 ? COLORS.profit : COLORS.loss;

  return (
    <div className={styles.panelSummary}>
      {/* Render the indicator circle */}
      <div className={mergeClasses(styles.indicatorCircle, indicatorStyle)} />
      <div className={styles.summaryMetrics}>
        {/* Win rate with fixed width container */}
        <div className={styles.metricContainer}>
          <Text size={200} className={styles.metricText}>
            Win: {summary.averageWinRate.toFixed(1)}%
          </Text>
        </div>
        {/* P&L with fixed width container */}
        <div className={styles.metricContainer}>
          <Text size={200} className={mergeClasses(styles.metricText, pnlClass)}>
            {' '}
            {/* Apply dynamic class here */}
            P&L: {summary.averagePnL >= 0 ? '+' : '-'}${Math.abs(summary.averagePnL).toFixed(2)}
          </Text>
        </div>
        <div className={styles.sparklineContainer}>
          {/* Use sparklineColor derived from COLORS */}
          <Sparkline data={history || []} width={75} height={20} color={sparklineColor} />
        </div>
      </div>
    </div>
  );
};

export const SimulationSummaryWidget: React.FC = () => {
  const styles = useStyles();
  // Get summaries to check if panels have data
  const { summaries } = useSimulationSummary();
  const hasLeftSummary = Boolean(summaries[PanelId.Left]);
  const hasRightSummary = Boolean(summaries[PanelId.Right]);

  // Don't render the widget if neither panel has summary data
  if (!hasLeftSummary && !hasRightSummary) {
    return null;
  }

  return (
    <div className={styles.widgetContainer}>
      {/* Conditionally render each panel's summary */}
      {hasLeftSummary && <PanelSummaryDisplay panelId={PanelId.Left} />}
      {hasRightSummary && <PanelSummaryDisplay panelId={PanelId.Right} />}
    </div>
  );
};
