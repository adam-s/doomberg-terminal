export type DataPoint = {
  x: number;
  y: number;
};

export function randomWalk(
  currentValue: number,
  bounds: { min: number; max: number } = { min: 0, max: 1 },
): number {
  const delta = (Math.random() - 0.5) * 0.3;
  let newValue = currentValue + delta;
  if (newValue < bounds.min) newValue = bounds.min;
  if (newValue > bounds.max) newValue = bounds.max;
  return newValue;
}
