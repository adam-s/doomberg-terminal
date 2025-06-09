/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useMemo } from 'react';
import { useParentSize } from '@visx/responsive';
import { makeStyles, Spinner } from '@fluentui/react-components';
import { DataPoint, useHistoricals } from '../../hooks/useHistoricals';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { Group } from '@visx/group';
import { curveMonotoneX } from '@visx/curve';
import { LagStatus } from '@src/side-panel/hooks/useLagStatus';
import { calculateSMA } from './utils';

const useStyles = makeStyles({
  root: {
    width: 'calc(100% - 10px)',
    height: 'calc(100% - 10px)',
    margin: '5px',
  },
  svg: {},
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});

interface LagChartProps {
  lag?: number;
  dataPoints?: number;
  onStatusChange?: (status: LagStatus) => void;
}

const margin = { top: 0, right: 0, bottom: 0, left: 0 };

const chartColors = {
  axis: {
    line: '#a6a6a6', // Corresponds to --colorNeutralForeground3
    text: '#c8c8c8', // Corresponds to --colorNeutralForeground2
  },
  grid: {
    line: '#6d6d6d', // Corresponds to --colorNeutralForeground4
    zeroLine: '#929292', // Changed from '#ffffff' to a darker grey
    positiveLine: '#8bd100', // Green color for when line is above zero
    negativeLine: '#f25022', // Red color for when line is below zero
  },
  series: [
    '#2899f5', // Corresponds to --colorBrandForeground1
    '#8bd100', // Corresponds to --colorPaletteLightGreenForeground2
    '#f0ab00', // Corresponds to --colorPaletteMarigoldForeground2
    '#e3008c', // Corresponds to --colorPaletteBerryForeground2
    '#0078d4', // Corresponds to --colorPaletteBlueForeground2
  ],
};

const calculatePercentageChanges = (data: DataPoint[], lag: number = 10): DataPoint[] => {
  return data.map((point, index) => {
    if (index < lag) {
      return {
        ...point,
        closePrice: 0, // First few points will be 0% change
      };
    }
    const previousPrice = data[index - lag].closePrice;
    const percentageChange = ((point.closePrice - previousPrice) / previousPrice) * 100;

    return {
      ...point,
      closePrice: percentageChange,
    };
  });
};

const Legend: React.FC<{
  lag: number;
  dataPoints: number;
  data: Record<string, DataPoint[]>;
}> = ({ lag, dataPoints, data }) => {
  const { currentSpread, isIncreasing, slope } = useMemo(() => {
    const qqqData = data['QQQ'] || [];
    const qqqCurrent = qqqData[qqqData.length - 1]?.closePrice ?? 0;
    const diaCurrent = data['DIA']?.slice(-1)[0]?.closePrice ?? 0;
    const qqqPrevious = qqqData[qqqData.length - 2]?.closePrice ?? 0;
    const diaPrevious = data['DIA']?.slice(-2)[0]?.closePrice ?? 0;

    // Calculate slope using only QQQ data
    let slope = 0;
    if (qqqData.length >= 3) {
      const last = qqqData[qqqData.length - 1];
      const thirdLast = qqqData[qqqData.length - 2];
      const timeDiff = (last.date.getTime() - thirdLast.date.getTime()) / 1000; // Convert to seconds
      slope = ((last.closePrice - thirdLast.closePrice) / timeDiff) * 10000; // Multiply by 100 to make it more readable
    }

    const currentSpread = qqqCurrent - diaCurrent;
    const previousSpread = qqqPrevious - diaPrevious;

    return {
      currentSpread: currentSpread.toFixed(2),
      isIncreasing: currentSpread > previousSpread,
      slope: slope.toFixed(4),
    };
  }, [data]);

  const getStatusColor = () => {
    const qqqLastValue = data['QQQ']?.slice(-1)[0]?.closePrice ?? 0;
    const spyLastValue = data['SPY']?.slice(-1)[0]?.closePrice ?? 0;
    const diaLastValue = data['DIA']?.slice(-1)[0]?.closePrice ?? 0;

    let status: LagStatus;
    if (qqqLastValue > spyLastValue && spyLastValue > diaLastValue) status = 'green';
    else if (qqqLastValue < spyLastValue && spyLastValue < diaLastValue) status = 'red';
    else status = 'neutral';

    return status === 'green'
      ? chartColors.grid.positiveLine
      : status === 'red'
        ? chartColors.grid.negativeLine
        : chartColors.grid.zeroLine;
  };

  return (
    <g>
      <circle cx={3} cy={7} r={3} fill={getStatusColor()} />
      <text
        x={12}
        y={10}
        fill={chartColors.axis.text}
        style={{ fontSize: '9px', fontFamily: 'inherit' }}>
        Lag {lag} • {dataPoints}p • {currentSpread}%
        <tspan
          fill={isIncreasing ? chartColors.grid.positiveLine : chartColors.grid.negativeLine}
          dx="3">
          {isIncreasing ? '▲' : '▼'}
        </tspan>
        <tspan> • {slope}°</tspan>
      </text>
    </g>
  );
};

export const LagChart: React.FC<LagChartProps> = ({ lag = 40, dataPoints = 100 }) => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  const { dataByTicker: rawDataByTicker } = useHistoricals();

  const dataByTicker = useMemo(() => {
    const truncatedData: Record<string, DataPoint[]> = {};
    const desiredTickers = ['QQQ', 'SPY', 'DIA'];

    Object.entries(rawDataByTicker)
      .filter(([ticker]) => desiredTickers.includes(ticker))
      .forEach(([ticker, data]) => {
        const percentageData = calculatePercentageChanges(data, lag);
        // Apply smoothing with a 5-period SMA
        const smoothedData = calculateSMA(percentageData, 5);
        const startIndex = Math.max(0, smoothedData.length - dataPoints);
        truncatedData[ticker] = smoothedData.slice(startIndex);
      });
    return truncatedData;
  }, [rawDataByTicker, lag, dataPoints]);

  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const firstDataSet = useMemo(() => {
    const datasets = Object.values(dataByTicker);
    return datasets.length > 0 ? datasets[0] : [];
  }, [dataByTicker]);

  const xDomain = useMemo(() => {
    const dates = firstDataSet.map(d => d.date.getTime());
    return [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
  }, [firstDataSet]);

  const yScale = useMemo(() => {
    const allPrices = Object.values(dataByTicker).flatMap(data => data.map(d => d.closePrice));
    const [min, max] = [Math.min(...allPrices), Math.max(...allPrices)];
    const padding = (max - min) * 0.1;
    return scaleLinear<number>({
      range: [yMax, 0],
      round: true,
      domain: [min - padding, max + padding],
      nice: true,
    });
  }, [yMax, dataByTicker]);

  const xScale = useMemo(
    () =>
      scaleTime({
        range: [0, xMax],
        domain: xDomain as [Date, Date],
      }),
    [xDomain, xMax],
  );

  const zeroLineY = yScale(0);
  const midLineY = yMax / 2;
  const isMidPointAboveZero = midLineY < zeroLineY;

  if (Object.keys(dataByTicker).length === 0) {
    return (
      <div ref={parentRef} className={styles.root}>
        <div className={styles.spinnerContainer}>
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className={styles.root}>
      <div style={{ width: width, height: height }}>
        <svg className={styles.svg} width={width} height={height}>
          <Legend lag={lag} dataPoints={dataPoints} data={dataByTicker} />
          <Group left={margin.left} top={margin.top}>
            {Object.entries(dataByTicker).map(([ticker, data], index) => (
              <LinePath
                key={ticker}
                data={data}
                x={d => xScale(d.date)}
                y={d => yScale(d.closePrice)}
                stroke={chartColors.series[index % chartColors.series.length]}
                strokeWidth={1}
                curve={curveMonotoneX}
              />
            ))}
            <Line
              from={{ x: 0, y: yMax / 2 }}
              to={{ x: xMax, y: yMax / 2 }}
              stroke={
                isMidPointAboveZero ? chartColors.grid.positiveLine : chartColors.grid.negativeLine
              }
              strokeWidth={0.5}
            />

            <Line
              from={{ x: 0, y: yScale(0) }}
              to={{ x: xMax, y: yScale(0) }}
              stroke={chartColors.grid.zeroLine}
              strokeDasharray={'2,2'}
              strokeWidth={1.5}
            />
          </Group>
        </svg>
      </div>
    </div>
  );
};
