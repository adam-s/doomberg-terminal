import { DataPoint } from '@src/side-panel/hooks/useHistoricals';
/**
 * Functions from utils.ts called in other files:
 * - calculateSMAForSymbol
 * - calculatePercentChangesForSymbol
 */

/**
 * Calculates Simple Moving Average for a series of data points
 * @param data Array of data points
 * @param window The window size for the moving average
 * @returns Array of data points with smoothed values
 */
export const calculateSMA = (data: DataPoint[], window: number): DataPoint[] => {
  return data.map((point, index) => {
    if (index < window - 1) {
      return point; // Return original point for initial values
    }

    const windowSlice = data.slice(index - window + 1, index + 1);
    const sum = windowSlice.reduce((acc, curr) => acc + curr.closePrice, 0);
    const average = sum / window;

    return {
      ...point,
      closePrice: average,
    };
  });
};

export const calculateMovingAverage = (data: number[], periods: number): number[] => {
  return data.map((_, index, array) => {
    const start = Math.max(0, index - periods + 1);
    const chunk = array.slice(start, index + 1);
    return chunk.reduce((sum, value) => sum + value, 0) / chunk.length;
  });
};

export const calculateSMAForSymbol = (
  prices: number[],
  period: number,
  maxSize: number,
): number[] => {
  if (prices.length < period) {
    return [];
  }

  const smaValues: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    smaValues.push(sum / period);
  }

  if (smaValues.length > maxSize) {
    return smaValues.slice(-maxSize);
  }
  return smaValues;
};
export const calculatePercentChangesForSymbol = (averages: number[], maxSize: number): number[] => {
  if (averages.length < 2) {
    return [];
  }

  const changes: number[] = [];
  for (let i = 1; i < averages.length; i++) {
    const current = averages[i];
    const previous = averages[i - 1];
    if (previous === 0) {
      // Avoid division by zero
      changes.push(0);
      continue;
    }
    const change = ((current - previous) / previous) * 100;
    changes.push(change);
  }

  if (changes.length > maxSize) {
    return changes.slice(-maxSize);
  }
  return changes;
};

export const calculateDerivative = (data: DataPoint[]): DataPoint[] => {
  return data.map((point, index) => {
    if (index === 0) {
      return { ...point, closePrice: 0 };
    }
    const previousPoint = data[index - 1];
    const rateOfChange = point.closePrice - previousPoint.closePrice;

    return {
      ...point,
      closePrice: rateOfChange,
    };
  });
};
