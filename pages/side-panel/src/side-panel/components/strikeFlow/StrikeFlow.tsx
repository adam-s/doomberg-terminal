import React, { useMemo, useState } from 'react';
import { makeStyles, shorthands, tokens, Text } from '@fluentui/react-components';
import { StrikeFlowChart } from './StrikeFlowChart';
import { useStrikeFlows } from '../../hooks/useStrikeFlows';

const QQQ_SYMBOL = 'QQQ';

const COLORS = {
  axis: { text: '#777' },
  toggle: { active: '#fff', inactive: '#777' },
};

const STRIKES_OPTIONS = [3, 100, 500];
const SYMBOL_OPTIONS = ['SPY', 'QQQ'];

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.padding('10px'),
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    ...shorthands.border('none'),
  },
  chartsContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.gap('12px'),
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    minHeight: '230px',
    paddingBottom: '8px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '12px',
    color: COLORS.axis.text,
    paddingLeft: '0px',
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: '1 1 auto',
    minHeight: 0,
  },
  messageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
  },
  toggleContainer: {
    display: 'flex',
    gap: '8px',
  },
  toggleText: {
    cursor: 'pointer',
  },
});

const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
};

export const StrikeFlow: React.FC = () => {
  const styles = useStyles();
  const [symbol, setSymbol] = useState<string>('QQQ');
  const { flowsByExpirationAndStrike, isLoading, error } = useStrikeFlows(symbol);

  const [deltasCount, setDeltasCount] = useState<number>(3);

  const expirationDates = useMemo(() => {
    if (!flowsByExpirationAndStrike) return [];
    return Object.keys(flowsByExpirationAndStrike).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [flowsByExpirationAndStrike]);

  const firstExpiration = useMemo(
    () => (expirationDates.length > 0 ? expirationDates[0] : ''),
    [expirationDates],
  );
  const formattedFirstExpiration = useMemo(() => formatDate(firstExpiration), [firstExpiration]);

  const secondExpiration = useMemo(
    () => (expirationDates.length > 1 ? expirationDates[1] : ''),
    [expirationDates],
  );
  const formattedSecondExpiration = useMemo(() => formatDate(secondExpiration), [secondExpiration]);

  if (isLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.messageContainer}>
          <Text>Loading expiration data...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.messageContainer}>
          <Text>Error loading data: {error.message}</Text>
        </div>
      </div>
    );
  }

  if (expirationDates.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.messageContainer}>
          <Text>No expiration dates found for {QQQ_SYMBOL}.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.chartsContainer}>
        {/* First Expiration Chart */}
        {firstExpiration && (
          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                }}>{`${symbol} (${formattedFirstExpiration})`}</div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {SYMBOL_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={styles.toggleText}
                    style={{
                      color: symbol === option ? COLORS.toggle.active : COLORS.toggle.inactive,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: '0 4px',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={symbol === option}
                    tabIndex={0}
                    onClick={() => setSymbol(option)}>
                    [{option.toLowerCase()}]
                  </button>
                ))}
              </div>
              <div
                className={styles.toggleContainer}
                style={{ flex: 1, justifyContent: 'flex-end' }}>
                {STRIKES_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={styles.toggleText}
                    style={{
                      color: deltasCount === option ? COLORS.toggle.active : COLORS.toggle.inactive,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={deltasCount === option}
                    tabIndex={0}
                    onClick={() => setDeltasCount(option)}>
                    [{option}]
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.chartContainer}>
              <StrikeFlowChart
                symbol={symbol}
                expirationDateIndex={0}
                strikesToDisplayAroundLtp={15}
                deltasCount={deltasCount}
              />
            </div>
          </div>
        )}

        {/* Second Expiration Chart */}
        {secondExpiration && (
          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                }}>{`${symbol} (${formattedSecondExpiration})`}</div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {SYMBOL_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={styles.toggleText}
                    style={{
                      color: symbol === option ? COLORS.toggle.active : COLORS.toggle.inactive,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: '0 4px',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={symbol === option}
                    tabIndex={0}
                    onClick={() => setSymbol(option)}>
                    [{option.toLowerCase()}]
                  </button>
                ))}
              </div>
              <div
                className={styles.toggleContainer}
                style={{ flex: 1, justifyContent: 'flex-end' }}>
                {STRIKES_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={styles.toggleText}
                    style={{
                      color: deltasCount === option ? COLORS.toggle.active : COLORS.toggle.inactive,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    aria-pressed={deltasCount === option}
                    tabIndex={0}
                    onClick={() => setDeltasCount(option)}>
                    [{option}]
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.chartContainer}>
              <StrikeFlowChart
                symbol={symbol}
                expirationDateIndex={1}
                strikesToDisplayAroundLtp={15}
                deltasCount={deltasCount}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
