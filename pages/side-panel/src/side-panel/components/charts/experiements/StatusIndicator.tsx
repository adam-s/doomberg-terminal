/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React from 'react';
import { LagStatus } from '../../hooks/useLagStatus';
import { chartColors } from '../../shared/chartColors';

interface StatusIndicatorProps {
  status: LagStatus;
  size?: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, size = 16 }) => {
  const radius = size * 0.375; // 6/16 = 0.375
  const center = size / 2;

  const fill =
    status === 'green'
      ? chartColors.grid.positiveLine
      : status === 'red'
        ? chartColors.grid.negativeLine
        : chartColors.grid.zeroLine;

  return (
    <svg width={size} height={size}>
      <circle cx={center} cy={center} r={radius} fill={fill} />
    </svg>
  );
};
