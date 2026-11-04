/** Maps a pointer x position on the bar to a stepped value inside [min, max]. */
export function valueFromPosition(
  x: number,
  left: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number {
  if (width <= 0) return min;
  const ratio = Math.max(0, Math.min(1, (x - left) / width));
  const raw = min + ratio * (max - min);
  const stepped = Math.round((raw - min) / step) * step + min;
  return Math.max(min, Math.min(max, Number(stepped.toFixed(6))));
}

/** Fill width in percent for a value. */
export function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}
