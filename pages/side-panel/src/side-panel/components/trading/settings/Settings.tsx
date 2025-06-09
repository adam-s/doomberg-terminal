import { makeStyles, Slider, Label, Text, tokens } from '@fluentui/react-components';
import {
  MOVING_AVERAGE_OPTIONS,
  CUMULATIVE_FLOW_OPTIONS,
  STOP_LOSS_OPTIONS,
  TAKE_PROFIT_OPTIONS,
  BULLISH_THRESHOLD_OPTIONS,
  BEARISH_THRESHOLD_OPTIONS,
  WIDENING_THRESHOLD_OPTIONS,
} from '@src/services/quant/settings';
import { QuantData } from '@src/side-panel/hooks/useQuant';

const useStyles = makeStyles({
  root: {
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorBrandForeground1,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    marginTop: '8px',
    marginBottom: '4px',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'row',
  },
});

interface SettingsProps {
  quantData: QuantData;
}

export const Settings = ({ quantData }: SettingsProps) => {
  const styles = useStyles();
  const {
    movingAveragePeriod,
    cumulativeFlowPeriod,
    stopLoss,
    takeProfit,
    bullishThreshold,
    bearishThreshold,
    wideningThreshold,
    setMovingAveragePeriod,
    setCumulativeFlowPeriod,
    setStopLoss,
    setTakeProfit,
    setBullishThreshold,
    setBearishThreshold,
    setWideningThreshold,
  } = quantData;

  const currentMaPeriodIndex =
    MOVING_AVERAGE_OPTIONS.indexOf(movingAveragePeriod) !== -1
      ? MOVING_AVERAGE_OPTIONS.indexOf(movingAveragePeriod)
      : 2;

  const currentCumulativeFlowIndex =
    CUMULATIVE_FLOW_OPTIONS.indexOf(cumulativeFlowPeriod) !== -1
      ? CUMULATIVE_FLOW_OPTIONS.indexOf(cumulativeFlowPeriod)
      : 2;

  const currentStopLossIndex =
    STOP_LOSS_OPTIONS.indexOf(stopLoss) !== -1 ? STOP_LOSS_OPTIONS.indexOf(stopLoss) : 2;

  const currentTakeProfitIndex =
    TAKE_PROFIT_OPTIONS.indexOf(takeProfit) !== -1 ? TAKE_PROFIT_OPTIONS.indexOf(takeProfit) : 2;

  const currentBullishThresholdIndex =
    BULLISH_THRESHOLD_OPTIONS.indexOf(bullishThreshold) !== -1
      ? BULLISH_THRESHOLD_OPTIONS.indexOf(bullishThreshold)
      : 3;

  const currentBearishThresholdIndex =
    BEARISH_THRESHOLD_OPTIONS.indexOf(bearishThreshold) !== -1
      ? BEARISH_THRESHOLD_OPTIONS.indexOf(bearishThreshold)
      : 3;

  const currentWideningThresholdIndex =
    WIDENING_THRESHOLD_OPTIONS.indexOf(wideningThreshold) !== -1
      ? WIDENING_THRESHOLD_OPTIONS.indexOf(wideningThreshold)
      : 2; // Default to index 2 (value 50)

  return (
    <div className={styles.root}>
      {' '}
      <Text className={styles.sectionTitle}>General Settings</Text>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="ma-period-slider">Moving Average Period</Label>
          <Text className={styles.value}>{movingAveragePeriod}</Text>
        </div>
        <Slider
          id="ma-period-slider"
          min={0}
          max={MOVING_AVERAGE_OPTIONS.length - 1}
          value={currentMaPeriodIndex}
          onChange={(_, data) => setMovingAveragePeriod(MOVING_AVERAGE_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="cumulative-flow-slider">Cumulative Flow Period</Label>
          <Text className={styles.value}>{cumulativeFlowPeriod}</Text>
        </div>
        <Slider
          id="cumulative-flow-slider"
          min={0}
          max={CUMULATIVE_FLOW_OPTIONS.length - 1}
          value={currentCumulativeFlowIndex}
          onChange={(_, data) => setCumulativeFlowPeriod(CUMULATIVE_FLOW_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <Text className={styles.sectionTitle}>Trade Controls</Text>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="stop-loss-slider">Stop Loss (cents)</Label>
          <Text className={styles.value}>{stopLoss}</Text>
        </div>
        <Slider
          id="stop-loss-slider"
          min={0}
          max={STOP_LOSS_OPTIONS.length - 1}
          value={currentStopLossIndex}
          onChange={(_, data) => setStopLoss(STOP_LOSS_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="take-profit-slider">Take Profit (cents)</Label>
          <Text className={styles.value}>{takeProfit}</Text>
        </div>
        <Slider
          id="take-profit-slider"
          min={0}
          max={TAKE_PROFIT_OPTIONS.length - 1}
          value={currentTakeProfitIndex}
          onChange={(_, data) => setTakeProfit(TAKE_PROFIT_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <Text className={styles.sectionTitle}>Market Thresholds</Text>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="bullish-threshold-slider">Bullish Threshold</Label>
          <Text className={styles.value}>{bullishThreshold}</Text>
        </div>
        <Slider
          id="bullish-threshold-slider"
          min={0}
          max={BULLISH_THRESHOLD_OPTIONS.length - 1}
          value={currentBullishThresholdIndex}
          onChange={(_, data) => setBullishThreshold(BULLISH_THRESHOLD_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="bearish-threshold-slider">Bearish Threshold</Label>
          <Text className={styles.value}>{bearishThreshold}</Text>
        </div>
        <Slider
          id="bearish-threshold-slider"
          min={0}
          max={BEARISH_THRESHOLD_OPTIONS.length - 1}
          value={currentBearishThresholdIndex}
          onChange={(_, data) => setBearishThreshold(BEARISH_THRESHOLD_OPTIONS[data.value])}
          step={1}
        />
      </div>
      <div className={styles.sliderContainer}>
        <div className={styles.labelRow}>
          <Label htmlFor="widening-threshold-slider">Re-entry Threshold</Label>
          <Text className={styles.value}>{wideningThreshold}</Text>
        </div>
        <Slider
          id="widening-threshold-slider"
          min={0}
          max={WIDENING_THRESHOLD_OPTIONS.length - 1}
          value={currentWideningThresholdIndex}
          onChange={(_, data) => setWideningThreshold(WIDENING_THRESHOLD_OPTIONS[data.value])}
          step={1}
        />
      </div>
    </div>
  );
};
