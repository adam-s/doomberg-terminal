import React, { useLayoutEffect, useState } from 'react';
import { Group } from '@visx/group';
import { Bar, LinePath } from '@visx/shape';
import { Text } from '@visx/text';
import { scaleLinear } from '@visx/scale';
import { AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { SimplifiedPricebookSnapshot } from '@src/services/pricebook/pricebookData.service';
import { useParentSize } from '@visx/responsive';

interface PricebookChartProps {
  data: SimplifiedPricebookSnapshot[];
  symbol: string;
}

// Update the color constants to match Flow
const COLORS = {
  axis: { line: '#777', text: '#777' },
  series: {
    bid: { line: '#8bd100', area: 'rgba(139,209,0,0.4)' },
    ask: { line: '#f25022', area: 'rgba(242,80,34,0.4)' },
  },
  lines: {
    mid: '#8A8886',
    sma: '#efb700',
  },
  background: 'rgba(0, 0, 0, 0.3)', // Add background color
};

const PricebookChart: React.FC<PricebookChartProps> = ({ data }) => {
  const { width, height, parentRef } = useParentSize();
  const [isReady, setIsReady] = useState(false);

  // Use useLayoutEffect to wait for proper sizing before rendering
  useLayoutEffect(() => {
    if (width && height && width > 0 && height > 0) {
      setIsReady(true);
    }
  }, [width, height]);

  // Return early until dimensions are available and stable
  if (!isReady || !width || !height) {
    return (
      <div
        ref={parentRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '300px', // Ensure minimum height to prevent layout shift
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    );
  }

  // Define margins for inner chart area.
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Compute min and max prices from both asks and bids.
  const allPrices = data.flatMap(d => [
    ...d.asks.map(ask => ask.price),
    ...d.bids.map(bid => bid.price),
  ]);

  // Calculate the midpoint and range for each snapshot
  const midPoints = data
    .slice(-30)
    .map(snapshot => {
      const bestBid =
        snapshot.bids.length > 0 ? Math.max(...snapshot.bids.map(bid => bid.price)) : null;
      const bestAsk =
        snapshot.asks.length > 0 ? Math.min(...snapshot.asks.map(ask => ask.price)) : null;
      return bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    })
    .filter((mp): mp is number => mp !== null);

  // Get the average midpoint if available, otherwise use the mean of all prices
  const avgMidPoint =
    midPoints.length > 0
      ? midPoints.reduce((sum, mp) => sum + mp, 0) / midPoints.length
      : (Math.max(...allPrices) + Math.min(...allPrices)) / 2;

  // Set price range to ±0.5 from the average midpoint
  const maxPrice = avgMidPoint + 0.75;
  const minPrice = avgMidPoint - 0.75;

  // Create scales.
  // xScale: evenly space snapshot columns by index.
  const xScale = scaleLinear<number>({
    domain: [0, data.length - 1],
    range: [0, xMax],
  });
  // yScale: map price to vertical position, with slight padding.
  const yScale = scaleLinear<number>({
    domain: [minPrice, maxPrice],
    range: [yMax, 0],
  });

  // Heat map cell settings.
  const cellHeight = 3; // fixed cell height for each price level bar
  const cellWidth = xMax / data.length; // each snapshot column width

  // Precompute continuous curve points
  const bidLineData: { x: number; y: number }[] = [];
  const askLineData: { x: number; y: number }[] = [];
  const midLineData: { x: number; y: number }[] = [];

  // Compute maximum volume across the entire chart
  let maxVolume = 1;
  data.forEach(snapshot => {
    const volumes = [
      ...snapshot.bids.map(bid => bid.quantity),
      ...snapshot.asks.map(ask => ask.quantity),
    ];
    maxVolume = Math.max(maxVolume, ...volumes);
  });

  // Calculate net imbalance SMA with price levels
  const imbalanceValues: Array<{ price: number; imbalance: number }> = [];
  const smaPeriod = 10; // SMA period
  const imbalanceSMAValues: (number | null)[] = [];

  data.forEach((snapshot, i) => {
    const filteredBids = snapshot.bids.filter(
      bid => bid.price >= minPrice && bid.price <= maxPrice,
    );
    const filteredAsks = snapshot.asks.filter(
      ask => ask.price >= minPrice && ask.price <= maxPrice,
    );

    // Get the midpoint price for this snapshot
    const bestBid =
      filteredBids.length > 0 ? Math.max(...filteredBids.map(bid => bid.price)) : null;
    const bestAsk =
      filteredAsks.length > 0 ? Math.min(...filteredAsks.map(ask => ask.price)) : null;
    const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

    // Compute net volume imbalance:
    const totalBid = filteredBids.reduce((sum, bid) => sum + bid.quantity, 0);
    const totalAsk = filteredAsks.reduce((sum, ask) => sum + ask.quantity, 0);
    const netImbalance =
      totalBid + totalAsk > 0 ? (totalBid - totalAsk) / (totalBid + totalAsk) : 0;

    if (midPrice !== null) {
      imbalanceValues.push({ price: midPrice, imbalance: netImbalance });
    }

    // Calculate SMA using actual price levels
    if (i >= smaPeriod - 1 && imbalanceValues.length >= smaPeriod) {
      const recentValues = imbalanceValues.slice(-smaPeriod);
      const smaPrice = recentValues.reduce((sum, val) => sum + val.price, 0) / smaPeriod;
      imbalanceSMAValues.push(smaPrice);
    } else {
      imbalanceSMAValues.push(null);
    }
  });

  data.forEach((snapshot, i) => {
    const filteredBids = snapshot.bids.filter(
      bid => bid.price >= minPrice && bid.price <= maxPrice,
    );
    const filteredAsks = snapshot.asks.filter(
      ask => ask.price >= minPrice && ask.price <= maxPrice,
    );
    if (filteredBids.length > 0) {
      const bestBid = Math.max(...filteredBids.map(bid => bid.price));
      bidLineData.push({ x: xScale(i) + cellWidth / 2, y: yScale(bestBid) });
    }
    if (filteredAsks.length > 0) {
      const bestAsk = Math.min(...filteredAsks.map(ask => ask.price));
      askLineData.push({ x: xScale(i) + cellWidth / 2, y: yScale(bestAsk) });
    }
    if (filteredBids.length > 0 && filteredAsks.length > 0) {
      const bestBid = Math.max(...filteredBids.map(bid => bid.price));
      const bestAsk = Math.min(...filteredAsks.map(ask => ask.price));
      const midPrice = (bestBid + bestAsk) / 2;
      midLineData.push({ x: xScale(i) + cellWidth / 2, y: yScale(midPrice) });
    }
  });

  // Instead of mutating with pop(), get last valid SMA non-mutative.
  const validSMAValues = imbalanceSMAValues.filter((v): v is number => v !== null);
  const lastValidSMA = validSMAValues[validSMAValues.length - 1];

  // Compute the 10th to last SMA value.
  const tenthToLastSMA =
    validSMAValues.length >= 30 ? validSMAValues[validSMAValues.length - 30] : null;

  return (
    <div ref={parentRef} style={{ width: '100%', height: '100%' }}>
      <svg style={{ width: '100%', height: '100%' }}>
        <Group left={margin.left} top={margin.top}>
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={value => `$${value.valueOf().toFixed(2)}`}
            stroke={COLORS.axis.line}
            tickStroke={COLORS.axis.line}
            tickLabelProps={() => ({
              fill: COLORS.axis.text,
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
              fontFamily: 'Arial, sans-serif',
            })}
          />

          {data.map((snapshot, i) => {
            // Filter orders within our price range first
            const filteredBids = snapshot.bids.filter(
              bid => bid.price >= minPrice && bid.price <= maxPrice,
            );
            const filteredAsks = snapshot.asks.filter(
              ask => ask.price >= minPrice && ask.price <= maxPrice,
            );

            return (
              <Group key={i} left={xScale(i)}>
                {/* Render heat map bars for bids */}
                {filteredBids.map((bid, bidIndex) => {
                  let intensity = Math.min(bid.quantity / maxVolume, 1);
                  intensity = Math.min(intensity * 1.1, 1); // Increase intensity slightly
                  return (
                    <Bar
                      key={`bid-${bidIndex}`}
                      x={0}
                      y={yScale(bid.price) - cellHeight / 2}
                      width={cellWidth}
                      height={cellHeight}
                      fill={`rgba(139,209,0,${intensity})`} // Flow green
                    />
                  );
                })}
                {/* Render heat map bars for asks */}
                {filteredAsks.map((ask, askIndex) => {
                  let intensity = Math.min(ask.quantity / maxVolume, 1);
                  intensity = Math.min(intensity * 1.1, 1); // Increase intensity slightly
                  return (
                    <Bar
                      key={`ask-${askIndex}`}
                      x={0} // changed from cellWidth to 0
                      y={yScale(ask.price) - cellHeight / 2}
                      width={cellWidth}
                      height={cellHeight}
                      fill={`rgba(242,80,34,${intensity})`} // Flow red
                    />
                  );
                })}
              </Group>
            );
          })}

          {/* Draw continuous curved lines with visx components */}
          {midLineData.length > 0 && (
            <LinePath
              data={midLineData}
              x={d => d.x}
              y={d => d.y}
              stroke={COLORS.lines.mid}
              strokeWidth={2}
              curve={curveMonotoneX}
            />
          )}

          {/* Draw SMA line */}
          <LinePath
            data={data
              .map((_, i) => ({
                x: xScale(i) + cellWidth / 2,
                y: imbalanceSMAValues[i] !== null ? yScale(imbalanceSMAValues[i]!) : null,
              }))
              .filter((d): d is { x: number; y: number } => d.y !== null)}
            x={d => d.x}
            y={d => d.y}
            stroke={COLORS.lines.sma}
            strokeWidth={2}
            curve={curveMonotoneX}
          />
          {/* Draw horizontal grid line at 10th to last SMA value behind all elements */}
          {tenthToLastSMA && (
            <line
              x1={0}
              y1={yScale(tenthToLastSMA)}
              x2={xMax}
              y2={yScale(tenthToLastSMA)}
              stroke="#999"
              strokeDasharray="3,2"
              strokeWidth={2}
            />
          )}
          {/* Add SMA price text in top-right corner with background */}
          {lastValidSMA && (
            <Group>
              <rect x={xMax - 90} y={3} width={100} height={24} fill={COLORS.background} rx={4} />
              <Text
                x={xMax - 5}
                y={15}
                textAnchor="end"
                fill={COLORS.lines.sma}
                fontSize={11}
                fontFamily="Arial, sans-serif"
                fontWeight={600}
                dy={5}>
                {`SMA: $${lastValidSMA.toFixed(2)}`}
              </Text>
            </Group>
          )}
        </Group>
      </svg>
    </div>
  );
};

export default PricebookChart;
