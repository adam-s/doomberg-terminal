import React, { useState, useEffect } from 'react';
import { Arc } from '@visx/shape';
import { Group } from '@visx/group';

export type DialProps = {
  width?: number;
  height?: number;
};

function randomWalk(currentValue: number) {
  const delta = (Math.random() - 0.5) * 0.1; // change by up to ±0.05
  let newValue = currentValue + delta;
  if (newValue < 0) newValue = 0;
  if (newValue > 1) newValue = 1;
  return newValue;
}

export const Dial = ({ width = 300, height = 150 }: DialProps) => {
  const [value, setValue] = useState(0.5);

  // Update the value every second using a random walk.
  useEffect(() => {
    const interval = setInterval(() => {
      setValue(v => randomWalk(v));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Define vertical margins as fractions of the height.
  const marginTop = height * 0.05;
  const marginBottom = height * 0.1;
  const availableHeight = height - marginTop - marginBottom;

  // Choose the gauge radius so that it fits both width and available height.
  const radius = Math.min(width / 3, availableHeight);
  // Center the gauge horizontally.
  const centerX = width / 2;
  // Position the gauge at the bottom of the available drawing area.
  const centerY = marginTop + availableHeight;

  // The gauge spans a semicircle (from 0 to π radians).
  const gaugeStart = 0;
  const gaugeEnd = Math.PI;
  const needleAngle = gaugeEnd - value * (gaugeEnd - gaugeStart);
  const adjustedRotation = -(((needleAngle - Math.PI / 2) * 180) / Math.PI);

  // Scale various dimensions relative to the radius.
  const outerRadius = radius;
  const innerRadius = radius * 0.9;
  const tickLength = radius * 0.08;
  const textRadius = innerRadius - tickLength - radius * 0.05;
  const needleLength = radius * 0.7;
  const tickFontSize = radius * 0.1; // ~10px when radius is 100
  const centerTextFontSize = radius * 0.14; // slightly larger for the percentage value
  const pivotRadius = radius * 0.05;

  // Tick marks at 0%, 25%, 50%, 75%, and 100%.
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg width={width} height={height}>
      <defs>
        {/* Define a subtle gradient for the arc fill */}
        <linearGradient id="arcGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d0d0d0" />
          <stop offset="100%" stopColor="#707070" />
        </linearGradient>
      </defs>
      <Group left={centerX} top={centerY}>
        {/* Draw the semicircular gauge arc */}
        <Arc
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={gaugeStart}
          endAngle={gaugeEnd}
          fill="url(#arcGradient)"
          cornerRadius={4}
        />
        {/* Render tick marks and numeric labels */}
        {ticks.map((tick, i) => {
          const angle = gaugeEnd - tick * (gaugeEnd - gaugeStart);
          const x1 = Math.cos(angle) * innerRadius;
          const y1 = -Math.sin(angle) * innerRadius;
          const x2 = Math.cos(angle) * (innerRadius + tickLength);
          const y2 = -Math.sin(angle) * (innerRadius + tickLength);
          const tx = Math.cos(angle) * textRadius;
          const ty = -Math.sin(angle) * textRadius;
          const tickLabel = Math.round(tick * 100);
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#888" strokeWidth={radius * 0.02} />
              <text
                x={tx}
                y={ty}
                fill="#555"
                fontSize={tickFontSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="Arial, sans-serif">
                {tickLabel}
              </text>
            </g>
          );
        })}
        {/* Draw the needle with smooth transition */}
        <g
          style={{ transition: 'transform 0.5s ease-out' }}
          transform={`rotate(${adjustedRotation})`}>
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-needleLength}
            stroke="#777"
            strokeWidth={radius * 0.03}
            strokeLinecap="round"
          />
        </g>
        {/* Center pivot circle */}
        <circle cx={0} cy={0} r={pivotRadius} fill="#777" />
        {/* Display the current percentage value above the pivot */}
        <text
          x={0}
          y={-pivotRadius * 2}
          textAnchor="middle"
          fill="#777"
          fontSize={centerTextFontSize}
          fontFamily="Arial, sans-serif">
          {Math.round(value * 100)}%
        </text>
      </Group>
    </svg>
  );
};

export default Dial;
