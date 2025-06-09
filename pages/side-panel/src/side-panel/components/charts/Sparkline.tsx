import React, { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { Group } from '@visx/group';
import { curveBasis } from '@visx/curve';

interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, width, height, color = '#2899f5' }) => {
  const validData = useMemo(() => {
    const filtered = Array.isArray(data)
      ? data.filter(d => typeof d === 'number' && !isNaN(d))
      : [];
    return filtered;
  }, [data]);

  const xMax = width;
  const yMax = height;

  const xScale = useMemo(
    () => scaleLinear({ range: [0, xMax], domain: [0, Math.max(1, validData.length - 1)] }),
    [xMax, validData.length],
  );

  const yScale = useMemo(() => {
    if (validData.length < 2) return scaleLinear({ range: [yMax, 0], domain: [0, 1] });

    const minValue = Math.min(...validData);
    const maxValue = Math.max(...validData);
    // Add a small margin for visual clarity
    const margin = Math.max(0.1, Math.abs(maxValue - minValue) * 0.1);
    const domainMin = minValue - margin;
    const domainMax = maxValue + margin;
    return scaleLinear({ range: [yMax, 0], domain: [domainMin, domainMax] });
  }, [yMax, validData]);

  // Early return if dimensions are invalid or not enough data points
  if (width <= 0 || height <= 0 || validData.length < 2) {
    return null;
  }

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <Group>
        <LinePath<number>
          data={validData}
          x={(_d, i) => xScale(i) ?? 0}
          y={d => yScale(d) ?? 0}
          stroke={color}
          strokeWidth={1}
          curve={curveBasis}
        />
      </Group>
    </svg>
  );
};
