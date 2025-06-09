import { DataPoint } from '@src/side-panel/hooks/useHistoricals';

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
