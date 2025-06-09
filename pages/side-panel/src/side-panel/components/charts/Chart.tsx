import React, { useMemo, useCallback, useRef } from 'react';
import { useParentSize } from '@visx/responsive';
import { makeStyles, tokens } from '@fluentui/react-components';
import { DataPoint, useHistoricals } from '../../hooks/useHistoricals';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { Group } from '@visx/group';
// Remove GridColumns, GridRows import
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useTooltip, defaultStyles, useTooltipInPortal } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { bisector } from 'd3-array';
import { formatInTimeZone } from 'date-fns-tz';
import { calculateSMA, calculateDerivative } from './utils';
import { curveMonotoneX } from '@visx/curve';

const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '100%',
    maxHeight: '225px',
  },
  svg: {},
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  emptyText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '1.5rem',
    color: tokens.colorNeutralForeground3,
  },
});

// Update margin to account for middle axis
const margin = { top: 20, right: 10, bottom: 30, left: 50, middle: 20 };

const formatDate = (date: Date) => formatInTimeZone(date, 'America/New_York', 'MM/dd hh:mm:ss aa');
const bisectDate = bisector<DataPoint, Date>(d => d.date).left;

const chartColors = {
  axis: {
    line: '#a6a6a6', // Corresponds to --colorNeutralForeground3
    text: '#c8c8c8', // Corresponds to --colorNeutralForeground2
  },
  grid: {
    zeroLine: '#8d8d8d', // slightly lighter than grid line
  },
  series: [
    '#2899f5', // Corresponds to --colorBrandForeground1
    '#8bd100', // Corresponds to --colorPaletteLightGreenForeground2
    '#f0ab00', // Corresponds to --colorPaletteMarigoldForeground2
    '#e3008c', // Corresponds to --colorPaletteBerryForeground2
    '#0078d4', // Corresponds to --colorPaletteBlueForeground2
  ],
  tooltip: {
    background: 'rgba(0, 0, 0, 0.7)', // Corresponds to --colorNeutralBackgroundAlpha2
    border: '#3b3a39', // Corresponds to --colorNeutralStroke1
    text: '#ffffff', // Corresponds to --colorNeutralForeground1
    label: '#a6a6a6', // Corresponds to --colorNeutralForeground3
    marker: '#0078d4', // Corresponds to --colorBrandBackground
  },
};

const Legend: React.FC<{
  tickers: string[];
  width: number;
  data: Record<string, DataPoint[]>;
}> = ({ tickers, width, data }) => {
  const itemWidth = width / tickers.length;
  return (
    <g transform={`translate(0, 15)`}>
      {tickers.map((ticker, index) => {
        const currentValue = data[ticker]?.slice(-1)[0]?.closePrice ?? 0;
        return (
          <g
            key={ticker}
            transform={`translate(${itemWidth * index + itemWidth / 2}, 0)`}
            style={{ fontSize: '10px' }}>
            <circle r={3} fill={chartColors.series[index % chartColors.series.length]} />
            <text dy=".25em" dx="6" fill={chartColors.axis.text} style={{ fontFamily: 'inherit' }}>
              {ticker} {currentValue.toFixed(2)}%
            </text>
          </g>
        );
      })}
    </g>
  );
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

// Remove the calculateSMA function from here as it's now in utils.ts

export const Chart: React.FC = () => {
  const styles = useStyles();
  const { parentRef, width, height } = useParentSize();
  // Added missing retrieval of rawDataByTicker from useHistoricals
  const { dataByTicker: rawDataByTicker } = useHistoricals();

  // Remove early return; create a flag instead.
  const shouldRender = width !== 0 && height !== 0;

  // All hooks below are always called.
  const individualChartHeight = useMemo(
    () => (height - margin.top - margin.bottom - margin.middle) / 2,
    [height],
  );
  const xMax = width - margin.left - margin.right;

  // The number of data points to display
  const DATA_SLICE_LENGTH = 100;

  // Process data
  const dataByTicker = useMemo(() => {
    const truncatedData: Record<string, DataPoint[]> = {};
    Object.entries(rawDataByTicker).forEach(([ticker, data]) => {
      const percentageData = calculatePercentageChanges(data, 180);
      const smoothedData = calculateSMA(percentageData, 60);
      const lastHundred = Math.max(0, smoothedData.length - DATA_SLICE_LENGTH);
      truncatedData[ticker] = smoothedData.slice(lastHundred);
    });
    return truncatedData;
  }, [rawDataByTicker]);

  const dataByTickerWithDerivative = useMemo(() => {
    const result: Record<string, { original: DataPoint[]; derivative: DataPoint[] }> = {};
    Object.entries(dataByTicker).forEach(([ticker, data]) => {
      result[ticker] = {
        original: data,
        derivative: calculateDerivative(data),
      };
    });
    return result;
  }, [dataByTicker]);

  // Calculate domains and scales
  const firstDataSet = useMemo(() => {
    const datasets = Object.values(dataByTicker);
    return datasets.length > 0 ? datasets[0] : [];
  }, [dataByTicker]);

  const xDomain = useMemo(() => {
    const dates = firstDataSet.map(d => d.date.getTime());
    return [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
  }, [firstDataSet]);

  const xScale = useMemo(
    () =>
      scaleTime({
        range: [0, xMax],
        domain: xDomain as [Date, Date],
      }),
    [xDomain, xMax],
  );

  const yScaleOriginal = useMemo(() => {
    const allPrices = Object.values(dataByTicker).flatMap(data => data.map(d => d.closePrice));
    const [min, max] = [Math.min(...allPrices), Math.max(...allPrices)];
    const padding = (max - min) * 0.1;
    return scaleLinear<number>({
      range: [individualChartHeight, 0],
      domain: [min - padding, max + padding],
      nice: true,
    });
  }, [individualChartHeight, dataByTicker]);

  const yScaleDerivative = useMemo(() => {
    const allPrices = Object.values(dataByTickerWithDerivative).flatMap(data =>
      data.derivative.map(d => d.closePrice),
    );
    const [min, max] = [Math.min(...allPrices), Math.max(...allPrices)];
    const padding = (max - min) * 0.1;
    return scaleLinear<number>({
      range: [individualChartHeight, 0],
      domain: [min - padding, max + padding],
      nice: true,
    });
  }, [individualChartHeight, dataByTickerWithDerivative]);

  // Setup tooltip
  const { containerRef, TooltipInPortal, containerBounds } = useTooltipInPortal({
    scroll: true,
    detectBounds: true,
  });

  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
    showTooltip,
    hideTooltip,
  } = useTooltip<{
    date: Date;
    values: { ticker: string; original: number; derivative: number }[];
    colorMap: Map<string, number>;
  }>();

  const tooltipTimeout = useRef<number>(100);

  const handleTooltip = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
      const { x } = localPoint(event) || { x: 0 };
      const x0 = xScale.invert(x - margin.left);
      const values: { ticker: string; original: number; derivative: number }[] = [];

      Object.keys(dataByTicker).forEach(ticker => {
        // For original
        const originalData = dataByTicker[ticker];
        const origIndex = bisectDate(originalData, x0, 1);
        const origD0 = originalData[origIndex - 1];
        const origD1 = originalData[origIndex];
        const originalValue =
          origD0 && origD1
            ? x0.valueOf() - origD0.date.valueOf() > origD1.date.valueOf() - x0.valueOf()
              ? origD1.closePrice
              : origD0.closePrice
            : origD0?.closePrice || origD1?.closePrice || 0;

        // For derivative
        const derivativeData = dataByTickerWithDerivative[ticker].derivative;
        const derivIndex = bisectDate(derivativeData, x0, 1);
        const derivD0 = derivativeData[derivIndex - 1];
        const derivD1 = derivativeData[derivIndex];
        const derivativeValue =
          derivD0 && derivD1
            ? x0.valueOf() - derivD0.date.valueOf() > derivD1.date.valueOf() - x0.valueOf()
              ? derivD1.closePrice
              : derivD0.closePrice
            : derivD0?.closePrice || derivD1?.closePrice || 0;

        values.push({ ticker, original: originalValue, derivative: derivativeValue });
      });

      // Create color mapping before sorting
      const colorMap = new Map(
        values.map((item, index) => [item.ticker, index % chartColors.series.length]),
      );

      // Sort values by original price in descending order
      values.sort((a, b) => b.original - a.original);

      if (values.length > 0) {
        const top =
          event.clientY +
          (containerBounds.top - containerBounds.bottom) / 2 +
          (margin.bottom - margin.top) / 2;
        const left = event.clientX - containerBounds.left;
        showTooltip({
          tooltipData: { date: x0, values, colorMap },
          tooltipLeft: left,
          tooltipTop: top,
        });
      }
    },
    [
      xScale,
      dataByTicker,
      dataByTickerWithDerivative,
      containerBounds.top,
      containerBounds.bottom,
      containerBounds.left,
      showTooltip,
    ],
  );

  // Render charts or a placeholder if dimensions are not yet available.
  return (
    <div ref={parentRef} className={styles.root}>
      {shouldRender ? (
        <div ref={containerRef} style={{ width, height }}>
          <svg className={styles.svg} width={width} height={height}>
            <rect x={0} y={0} width={width} height={height} fill="transparent" />
            <Legend
              tickers={Object.keys(dataByTicker)}
              width={width - margin.left - margin.right}
              data={dataByTicker}
            />

            {/* Top Chart - Original */}
            <Group left={margin.left} top={margin.top}>
              <Line
                from={{ x: 0, y: yScaleOriginal(0) }}
                to={{ x: xMax, y: yScaleOriginal(0) }}
                stroke={chartColors.grid.zeroLine}
                strokeWidth={1}
                strokeOpacity={1}
              />
              <AxisLeft
                scale={yScaleOriginal}
                numTicks={2}
                stroke={chartColors.axis.line}
                tickStroke={chartColors.axis.line}
                tickLabelProps={() => ({
                  fill: chartColors.axis.text,
                  fontSize: 10,
                  textAnchor: 'end',
                })}
              />
              {Object.entries(dataByTickerWithDerivative).map(([ticker, data], index) => (
                <LinePath
                  key={ticker}
                  data={data.original}
                  x={d => xScale(d.date)}
                  y={d => yScaleOriginal(d.closePrice)}
                  stroke={chartColors.series[index % chartColors.series.length]}
                  strokeWidth={1}
                  curve={curveMonotoneX}
                />
              ))}
            </Group>

            {/* Bottom Chart - Derivative */}
            <Group left={margin.left} top={margin.top + individualChartHeight + margin.middle}>
              <Line
                from={{ x: 0, y: yScaleDerivative(0) }}
                to={{ x: xMax, y: yScaleDerivative(0) }}
                stroke={chartColors.grid.zeroLine}
                strokeWidth={1}
                strokeOpacity={1}
              />
              <AxisLeft
                scale={yScaleDerivative}
                numTicks={2}
                stroke={chartColors.axis.line}
                tickStroke={chartColors.axis.line}
                tickLabelProps={() => ({
                  fill: chartColors.axis.text,
                  fontSize: 10,
                  textAnchor: 'end',
                })}
              />
              <AxisBottom
                top={individualChartHeight}
                scale={xScale}
                numTicks={3}
                stroke={chartColors.axis.line}
                tickStroke={chartColors.axis.line}
                tickLabelProps={() => ({
                  fill: chartColors.axis.text,
                  fontSize: 10,
                  textAnchor: 'middle',
                })}
              />
              {Object.entries(dataByTickerWithDerivative).map(([ticker, data], index) => (
                <LinePath
                  key={ticker}
                  data={data.derivative.slice(1)} // Skip the first derivative value
                  x={d => xScale(d.date)}
                  y={d => yScaleDerivative(d.closePrice)}
                  stroke={chartColors.series[index % chartColors.series.length]}
                  strokeWidth={1}
                />
              ))}
            </Group>

            {/* Tooltip overlay */}
            <rect
              x={margin.left}
              y={margin.top}
              width={xMax}
              height={height - margin.top - margin.bottom}
              fill="transparent"
              onMouseMove={handleTooltip}
              onMouseLeave={() => {
                tooltipTimeout.current = window.setTimeout(() => {
                  hideTooltip();
                }, 300);
              }}
            />

            {/* Render tooltip dots for both charts */}
            {tooltipData && (
              <g>
                {/* Vertical guideline */}
                <Line
                  from={{ x: tooltipLeft, y: margin.top }}
                  to={{ x: tooltipLeft, y: height - margin.bottom }}
                  stroke={chartColors.tooltip.marker}
                  strokeWidth={1}
                  strokeDasharray="5,3"
                  pointerEvents="none"
                />
                {tooltipData.values.map(({ ticker, original, derivative }) => (
                  <g key={ticker}>
                    <circle
                      cx={tooltipLeft}
                      cy={yScaleOriginal(original) + margin.top}
                      r={4}
                      fill={chartColors.series[tooltipData.colorMap.get(ticker)!]}
                      stroke={chartColors.tooltip.background}
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                    <circle
                      cx={tooltipLeft}
                      cy={
                        yScaleDerivative(derivative) +
                        margin.top +
                        individualChartHeight +
                        margin.middle
                      }
                      r={4}
                      fill={chartColors.series[tooltipData.colorMap.get(ticker)!]}
                      stroke={chartColors.tooltip.background}
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  </g>
                ))}
              </g>
            )}
          </svg>
          {tooltipOpen && tooltipData && (
            <TooltipInPortal
              key={Math.random()}
              top={tooltipTop}
              left={tooltipLeft}
              style={{
                ...defaultStyles,
                background: `${chartColors.tooltip.background}`,
                padding: '0.75rem',
                border: `1px solid ${chartColors.tooltip.border}`,
                borderRadius: tokens.borderRadiusMedium,
                color: chartColors.tooltip.text,
                boxShadow: tokens.shadow4,
                fontSize: '10px',
                zIndex: 1000,
              }}>
              <div
                style={{
                  marginBottom: '0.5rem',
                  fontWeight: tokens.fontWeightSemibold,
                }}>
                {formatDate(tooltipData.date)}
              </div>
              {tooltipData.values.map(({ ticker, original, derivative }) => (
                <div
                  key={ticker}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.25rem 0',
                    alignItems: 'center',
                  }}>
                  <span
                    style={{
                      marginRight: '1rem',
                      color: chartColors.tooltip.label,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                    <span
                      style={{
                        width: '6px', // Slightly smaller dot for 10px font
                        height: '6px',
                        borderRadius: '50%',
                        background: chartColors.series[tooltipData.colorMap.get(ticker)!],
                      }}
                    />
                    {ticker}
                  </span>
                  <span
                    style={{
                      fontFamily: tokens.fontFamilyMonospace,
                      minWidth: '60px', // Fixed width for price container
                      textAlign: 'right',
                    }}>
                    {original.toFixed(2)}% / {derivative.toFixed(2)}%
                  </span>
                </div>
              ))}
            </TooltipInPortal>
          )}
        </div>
      ) : null}
    </div>
  );
};
