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
    '#0047b3', // QQQ raw data - darker blue
    '#2899f5', // QQQ lagged - original blue
    '#8bd100', // SPY lagged
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

// Add new function to normalize raw data
const normalizeRawData = (data: DataPoint[], startIndex: number): DataPoint[] => {
  const firstValue = data[startIndex].closePrice;
  return data.slice(startIndex).map(point => ({
    ...point,
    closePrice: ((point.closePrice - firstValue) / firstValue) * 100,
  }));
};

const Legend: React.FC<{
  lag: number;
  dataPoints: number;
  data: Record<string, DataPoint[]>;
}> = ({ lag, dataPoints, data }) => {
  const getStatusColor = () => {
    const qqqLastValue = data['QQQ']?.slice(-1)[0]?.closePrice ?? 0;
    const spyLastValue = data['SPY']?.slice(-1)[0]?.closePrice ?? 0;
    const diaLastValue = data['DIA']?.slice(-1)[0]?.closePrice ?? 0;

    if (qqqLastValue > spyLastValue && spyLastValue > diaLastValue)
      return chartColors.grid.positiveLine;
    if (qqqLastValue < spyLastValue && spyLastValue < diaLastValue)
      return chartColors.grid.negativeLine;
    return chartColors.grid.zeroLine;
  };

  return (
    <g>
      <circle cx={3} cy={7} r={3} fill={getStatusColor()} />
      <text
        x={12}
        y={10}
        fill={chartColors.axis.text}
        style={{ fontSize: '9px', fontFamily: 'inherit' }}>
        Lag {lag} • {dataPoints}p
      </text>
    </g>
  );
};

export const LagChartWithStock: React.FC<LagChartProps> = ({ lag = 40, dataPoints = 100 }) => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  const { dataByTicker: rawDataByTicker } = useHistoricals();

  const dataByTicker = useMemo(() => {
    const truncatedData: Record<string, DataPoint[]> = {};
    const desiredTickers = ['QQQ', 'SPY', 'DIA'];

    Object.entries(rawDataByTicker)
      .filter(([ticker]) => desiredTickers.includes(ticker))
      .forEach(([ticker, data]) => {
        const startIndex = Math.max(0, data.length - dataPoints);

        // Add raw QQQ data
        if (ticker === 'QQQ') {
          truncatedData['QQQ_RAW'] = normalizeRawData(data, startIndex);
        }

        const percentageData = calculatePercentageChanges(data, lag);
        truncatedData[ticker] = percentageData.slice(startIndex);
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
            {/* Render lagged data first */}
            {Object.entries(dataByTicker)
              .filter(([ticker]) => ticker !== 'QQQ_RAW')
              .map(([ticker, data], index) => (
                <LinePath
                  key={ticker}
                  data={data}
                  x={d => xScale(d.date)}
                  y={d => yScale(d.closePrice)}
                  stroke={chartColors.series[(index + 1) % chartColors.series.length]}
                  strokeWidth={1}
                  curve={curveMonotoneX}
                />
              ))}

            <Line
              from={{ x: 0, y: yScale(0) }}
              to={{ x: xMax, y: yScale(0) }}
              stroke={chartColors.grid.zeroLine}
              strokeDasharray={'2,2'}
              strokeWidth={1.5}
            />

            {/* Render raw stock data last */}
            {dataByTicker['QQQ_RAW'] && (
              <LinePath
                key="QQQ_RAW"
                data={dataByTicker['QQQ_RAW']}
                x={d => xScale(d.date)}
                y={d => yScale(d.closePrice)}
                stroke={chartColors.series[0]}
                strokeWidth={2.5}
                curve={curveMonotoneX}
              />
            )}
          </Group>
        </svg>
      </div>
    </div>
  );
};
