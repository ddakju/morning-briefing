/**
 * Compact (single-line) formatter for the morning briefing.
 * Produces a brief summary suitable for notifications or status bars.
 */

import type {
  BriefingResult,
  WeatherData,
  CalendarData,
  NewsData,
  RemindersData,
} from '../modules/types.js';
import { isModuleError } from '../modules/types.js';

/**
 * Format the briefing result as a compact single-line summary.
 *
 * Example output:
 *   "\u2600\uFE0F 15\u00B0C | \u{1F4C5} 3 events | \u{1F4F0} 5 headlines | \u2705 2 reminders"
 */
export function formatCompact(result: BriefingResult): string {
  const parts: string[] = [];

  // Weather
  if (result.weather !== undefined) {
    if (isModuleError(result.weather)) {
      parts.push('\u26A0\uFE0F Weather error');
    } else {
      const w = result.weather as WeatherData;
      parts.push(`${w.current.conditionEmoji} ${w.current.temp}\u00B0`);
    }
  }

  // Calendar
  if (result.calendar !== undefined) {
    if (isModuleError(result.calendar)) {
      parts.push('\u26A0\uFE0F Calendar error');
    } else {
      const c = result.calendar as CalendarData;
      parts.push(`\u{1F4C5} ${c.totalCount} event${c.totalCount !== 1 ? 's' : ''}`);
    }
  }

  // News
  if (result.news !== undefined) {
    if (isModuleError(result.news)) {
      parts.push('\u26A0\uFE0F News error');
    } else {
      const n = result.news as NewsData;
      const headlineCount = n.feeds.reduce((sum, f) => sum + f.items.length, 0);
      parts.push(`\u{1F4F0} ${headlineCount} headline${headlineCount !== 1 ? 's' : ''}`);
    }
  }

  // Reminders
  if (result.reminders !== undefined) {
    if (isModuleError(result.reminders)) {
      parts.push('\u26A0\uFE0F Reminders error');
    } else {
      const r = result.reminders as RemindersData;
      parts.push(`\u2705 ${r.totalCount} reminder${r.totalCount !== 1 ? 's' : ''}`);
    }
  }

  return parts.join(' | ') || 'No data available.';
}
