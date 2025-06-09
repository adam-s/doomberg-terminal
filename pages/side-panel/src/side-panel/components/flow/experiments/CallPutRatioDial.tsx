import { Arc } from '@visx/shape';
import { Group } from '@visx/group';
import { useExtrinsicValueData } from '@src/side-panel/hooks/useExtrinsicValueFlows';

export type CallPutRatioDialProps = {
  width?: number;
  height?: number;
  symbol?: string;
};

export const CallPutRatioDial = ({
  width = 300,
  height = 100,
  symbol = 'QQQ',
}: CallPutRatioDialProps) => {
  const { flowBySymbol } = useExtrinsicValueData();
  const callPutRatioData = flowBySymbol?.[symbol]?.callPutRatio ?? [];
  const value = (callPutRatioData[callPutRatioData.length - 1] ?? 0) / 100;

  // Set vertical margins and compute available height
  const marginTop = height * 0.05;
  const marginBottom = height * 0.1;
  const availableHeight = height - marginTop - marginBottom;

  // Choose the gauge radius so it fits within the width and available height.
  const radius = Math.min(width / 3, availableHeight);
  const centerX = width / 2;
  const centerY = marginTop + availableHeight;

  // Simplify needle rotation: (value - 0.5)*180 degrees.
  const needleRotation = (value - 0.5) * 180;

  // Compute radii and dimensions based on the gauge radius.
  const outerRadius = radius;
  const innerRadius = radius * 0.9;
  const tickLength = radius * 0.08;
  const textRadius = innerRadius - tickLength - radius * 0.05;
  const needleLength = radius * 0.7;
  const tickFontSize = radius * 0.1;
  const centerTextFontSize = radius * 0.14;
  const pivotRadius = radius * 0.05;

  // Tick marks at 0%, 25%, 50%, 75%, and 100%.
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id="arcGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f25022" />
          <stop offset="100%" stopColor="#8bd100" />
        </linearGradient>
      </defs>
      <Group left={centerX} top={centerY}>
        {/* Draw the semicircular arc using the simplified start/end angles */}
        <Arc
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={-Math.PI / 2}
          endAngle={Math.PI / 2}
          fill="url(#arcGradient)"
          cornerRadius={4}
        />
        {/* Render tick marks and numeric labels */}
        {ticks.map((tick, i) => {
          // The original gauge angle runs from π to 0 (left to right).
          // Compute the angle for the tick mark.
          const angle = Math.PI - tick * Math.PI;
          const x1 = Math.cos(angle) * innerRadius;
          const y1 = -Math.sin(angle) * innerRadius;
          const x2 = Math.cos(angle) * (innerRadius + tickLength);
          const y2 = -Math.sin(angle) * (innerRadius + tickLength);
          const tx = Math.cos(angle) * textRadius;
          const ty = -Math.sin(angle) * textRadius;
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
                {Math.round(tick * 100)}
              </text>
            </g>
          );
        })}
        {/* Draw the needle using the simplified rotation */}
        <g
          style={{ transition: 'transform 0.5s ease-out' }}
          transform={`rotate(${needleRotation})`}>
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

export default CallPutRatioDial;
