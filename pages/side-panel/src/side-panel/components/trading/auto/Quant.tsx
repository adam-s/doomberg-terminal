import { makeStyles, Text, Card } from '@fluentui/react-components';
import { QuantData } from '@src/side-panel/hooks/useQuant';
import { PriceChart } from '../../charts/PriceChart';

interface QuantProps {
  quantData: QuantData;
}

const useStyles = makeStyles({
  root: {
    padding: '10px',
  },
  card: {
    padding: '12px',
    marginTop: '10px',
    // Ensure card can contain the chart
    overflow: 'hidden',
  },
  valueDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  label: {
    fontWeight: 'bold',
  },
  chartTitle: {
    fontSize: '12px',
    color: '#777',
    marginBottom: '4px',
    textAlign: 'center',
  },
});

export const Quant = ({ quantData }: QuantProps) => {
  const styles = useStyles();
  const { status, movingAveragePeriod } = quantData;

  return (
    <div className={styles.root}>
      <h2>Quant</h2>
      <Card className={styles.card}>
        <div className={styles.valueDisplay}>
          <Text className={styles.label}>Status:</Text>
          <Text>{status}</Text>
        </div>
        <div className={styles.valueDisplay}>
          <Text className={styles.label}>Moving Average Period:</Text>
          <Text>{movingAveragePeriod}</Text>
        </div>
      </Card>
      <PriceChart />
    </div>
  );
};
