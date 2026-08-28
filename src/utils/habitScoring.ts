export type HabitRating = 1 | 2 | 3 | 4 | 5;

export function calculateHabitScore(
  impact: number,
  friction: number,
  keystone: number,
  timeCost: number,
): number {
  const rawMinusMinimum =
    impact + (6 - friction) + keystone + (6 - timeCost) - 4;
  return Math.floor((100 * rawMinusMinimum + 8) / 16);
}
