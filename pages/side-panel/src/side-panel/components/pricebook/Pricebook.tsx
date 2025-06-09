import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { usePricebook } from '@src/side-panel/hooks/usePricebook';
import PricebookChart from './PricebookChart';
import { useTextStyles } from './textStyles';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    height: '100%',
  },
  symbol: {
    display: 'flex',
    flexDirection: 'column',
  },
  chartSection: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flex: '1 1 auto',
    minHeight: '85px',
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: '1 1 auto',
    paddingRight: '10px',
  },
  emptyText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '16px',
    color: '#6b6b6b',
  },
});

export const Pricebook: React.FC = () => {
  const styles = useStyles();
  const textStyles = useTextStyles();
  const { pricebookBySymbol } = usePricebook();
  return (
    <div className={styles.root}>
      {Object.entries(pricebookBySymbol).map(([symbol, data]) => (
        <div key={symbol} className={styles.symbol}>
          <div className={mergeClasses(textStyles.symbolText)}>{symbol}</div>
          <div className={styles.chartSection}>
            <div className={styles.chartContainer}>
              {data.history && data.history.length > 0 ? (
                <PricebookChart data={data.history} symbol={symbol} />
              ) : (
                <div className={styles.emptyText}>No data available.</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
