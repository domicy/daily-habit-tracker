import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface LeaderboardTimeWindow {
  start: number;
  end: number;
}

/** Return inclusive epoch-millisecond boundaries for the selected UI tab. */
export function getLeaderboardTimeWindow(
  period: LeaderboardPeriod,
  now = new Date(),
): LeaderboardTimeWindow {
  let start: Date;
  let end: Date;
  switch (period) {
    case 'daily':
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case 'weekly':
      start = startOfWeek(now, {weekStartsOn: 1});
      end = endOfWeek(now, {weekStartsOn: 1});
      break;
    case 'monthly':
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case 'yearly':
      start = startOfYear(now);
      end = endOfYear(now);
      break;
  }
  return {start: start.getTime(), end: end.getTime()};
}
