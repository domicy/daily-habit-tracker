import {format} from 'date-fns';

/**
 * Returns the device-local date as "YYYY-MM-DD".
 *
 * This MUST be used everywhere the app needs "today" as a calendar date.
 * Never use `new Date().toISOString().slice(0, 10)` — that returns UTC,
 * which can be a different calendar date than the user's local time.
 */
export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Returns the device-local date formatted for display (e.g. "Wednesday, March 5").
 */
export function getFormattedToday(): string {
  return format(new Date(), 'EEEE, MMMM d');
}
