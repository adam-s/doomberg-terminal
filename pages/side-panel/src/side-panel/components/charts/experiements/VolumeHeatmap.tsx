import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleLog } from '@visx/scale';
import { AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { useTooltip, defaultStyles, TooltipWithBounds } from '@visx/tooltip';
import { tokens } from '@fluentui/react-components';

interface Props {
  data: Array<{
    strikePrice: number;
    volumes: number[];
    type: 'call' | 'put';
  }>;
  timeLabels: string[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  volumeMax?: number;
}

interface TooltipData {
  strikePrice: number;
  volume: number;
  time: string;
}

const defaultMargin = { top: 40, right: 10, bottom: 10, left: 45 };

const CALL_COLOR = tokens.colorPaletteGreenBackground3;
const PUT_COLOR = tokens.colorPaletteRedBackground3;

export const VolumeHeatmap: React.FC<Props> = ({
  data,
  timeLabels,
  width,
  height,
  margin = defaultMargin,
}) => {
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<TooltipData>();

  // Dimensions
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, timeLabels.length],
        range: [0, xMax],
      }),
    [xMax, timeLabels.length],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [
          Math.min(...data.map(d => d.strikePrice)),
          Math.max(...data.map(d => d.strikePrice)),
        ],
        range: [yMax, 0],
      }),
    [yMax, data],
  );

  const volumeScale = useMemo(
    () =>
      scaleLog<number>({
        domain: [1, 1000],
        range: [0.05, 1],
        clamp: true,
      }),
    [],
  );

  const binWidth = xMax / timeLabels.length;
  const binHeight = yMax / data.length;

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 70,
          display: 'flex',
          gap: '12px',
          fontSize: '12px',
          color: tokens.colorNeutralForeground1,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '12px', background: CALL_COLOR }} />
          Calls
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '12px', background: PUT_COLOR }} />
          Puts
        </div>
      </div>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={xMax}
            height={yMax}
            stroke={tokens.colorNeutralStroke1}
            numTicks={5}
          />
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={d => `$${d}`}
            stroke={tokens.colorNeutralForeground1}
            tickStroke={tokens.colorNeutralForeground1}
            tickLabelProps={() => ({
              fill: tokens.colorNeutralForeground1,
              fontSize: 11,
              textAnchor: 'end',
              dx: -4,
            })}
          />
          {data.map((row, yIndex) => {
            return row.volumes.map((volume, xIndex) => {
              // Skip rendering if volume is 0 or undefined
              if (!volume) return null;

              const fillColor = row.type === 'call' ? CALL_COLOR : PUT_COLOR;

              return (
                <rect
                  key={`${yIndex}-${xIndex}`}
                  x={xScale(xIndex)}
                  y={yScale(row.strikePrice) - binHeight / 2}
                  width={binWidth}
                  height={binHeight}
                  fill={fillColor}
                  fillOpacity={volumeScale(volume)}
                  onMouseMove={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    showTooltip({
                      tooltipData: {
                        strikePrice: row.strikePrice,
                        volume,
                        time: timeLabels[xIndex],
                      },
                      tooltipLeft: rect.left,
                      tooltipTop: rect.top,
                    });
                  }}
                  onMouseLeave={() => hideTooltip()}
                />
              );
            });
          })}
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={Math.random()}
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: tokens.colorNeutralBackground1,
            padding: '8px',
            border: `1px solid ${tokens.colorNeutralStroke1}`,
            color: tokens.colorNeutralForeground1,
          }}>
          <div>Strike: {tooltipData.strikePrice}</div>
          <div>Volume: {tooltipData.volume}</div>
          <div>Time: {tooltipData.time}</div>
        </TooltipWithBounds>
      )}
    </div>
  );
};
