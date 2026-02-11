/**
 * Default (rich) formatter for the morning briefing.
 * Produces a human-readable, emoji-decorated multi-section output.
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
 * Format the briefing result using the rich default template.
 */
export function formatDefault(
  result: BriefingResult,
  locale: string,
  timezone: string,
): string {
  const sections: string[] = [];

  // Header
  const dateStr = new Date(result.timestamp).toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
  sections.push(`\u{1F305} Morning Briefing \u2014 ${dateStr}`);
  sections.push('='.repeat(50));

  // Weather
  if (result.weather !== undefined) {
    sections.push(formatWeatherSection(result.weather, locale, timezone));
  }

  // Calendar
  if (result.calendar !== undefined) {
    sections.push(formatCalendarSection(result.calendar, locale, timezone));
  }

  // News
  if (result.news !== undefined) {
    sections.push(formatNewsSection(result.news));
  }

  // Reminders
  if (result.reminders !== undefined) {
    sections.push(formatRemindersSection(result.reminders));
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Section formatters
// ---------------------------------------------------------------------------

function formatWeatherSection(data: WeatherData | { error: string }, locale: string, timezone: string): string {
  const header = '\u{1F324}\uFE0F  Weather';
  if (isModuleError(data)) {
    return `${header}\n  \u26A0\uFE0F Error: ${data.error}`;
  }

  const w = data as WeatherData;
  const lines: string[] = [header, '-'.repeat(40)];

  lines.push(`  \u{1F4CD} ${w.location}`);
  lines.push(
    `  ${w.current.conditionEmoji} ${w.current.condition}  |  \u{1F321}\uFE0F ${w.current.temp}\u00B0 (feels like ${w.current.feelsLike}\u00B0)`,
  );
  lines.push(
    `  \u{1F4A7} Humidity: ${w.current.humidity}%  |  \u{1F32C}\uFE0F Wind: ${w.current.wind.speed} ${w.current.wind.direction}`,
  );
  lines.push(`  \u{1F305} Sunrise: ${w.sunrise}  |  \u{1F307} Sunset: ${w.sunset}`);

  if (w.forecast.length > 0) {
    lines.push('');
    lines.push('  Forecast:');
    for (const day of w.forecast) {
      const dateLabel = formatShortDate(day.date, locale, timezone);
      lines.push(
        `    ${dateLabel}: ${day.high}\u00B0/${day.low}\u00B0  ${day.condition}  (\u{1F327}\uFE0F ${day.precipChance}%)`,
      );
    }
  }

  return lines.join('\n');
}

function formatCalendarSection(data: CalendarData | { error: string }, locale: string, timezone: string): string {
  const header = '\u{1F4C5}  Calendar';
  if (isModuleError(data)) {
    return `${header}\n  \u26A0\uFE0F Error: ${data.error}`;
  }

  const cal = data as CalendarData;
  const lines: string[] = [header, '-'.repeat(40)];

  if (cal.events.length === 0) {
    lines.push('  No upcoming events.');
    return lines.join('\n');
  }

  lines.push(`  ${cal.totalCount} event${cal.totalCount !== 1 ? 's' : ''}:`);
  lines.push('');

  for (const evt of cal.events) {
    const timeStr = evt.allDay
      ? 'All day'
      : formatTimeRange(evt.start, evt.end, locale, timezone);
    const locationStr = evt.location ? ` (\u{1F4CD} ${evt.location})` : '';
    const calLabel = evt.calendar ? ` [${evt.calendar}]` : '';
    lines.push(`  \u2022 ${timeStr} \u2014 ${evt.title}${locationStr}${calLabel}`);
  }

  return lines.join('\n');
}

function formatNewsSection(data: NewsData | { error: string }): string {
  const header = '\u{1F4F0}  News';
  if (isModuleError(data)) {
    return `${header}\n  \u26A0\uFE0F Error: ${data.error}`;
  }

  const news = data as NewsData;
  const lines: string[] = [header, '-'.repeat(40)];

  if (news.feeds.length === 0) {
    lines.push('  No feeds configured.');
    return lines.join('\n');
  }

  for (const feed of news.feeds) {
    lines.push(`  \u{1F4E1} ${feed.name}`);
    if (feed.error) {
      lines.push(`    \u26A0\uFE0F ${feed.error}`);
      continue;
    }
    if (feed.items.length === 0) {
      lines.push('    No recent items.');
      continue;
    }
    for (const item of feed.items) {
      lines.push(`    \u2022 ${item.title}`);
      if (item.summary) {
        lines.push(`      ${item.summary}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRemindersSection(data: RemindersData | { error: string }): string {
  const header = '\u2705  Reminders';
  if (isModuleError(data)) {
    return `${header}\n  \u26A0\uFE0F Error: ${data.error}`;
  }

  const rem = data as RemindersData;
  const lines: string[] = [header, '-'.repeat(40)];

  if (rem.lists.length === 0) {
    lines.push('  No reminders.');
    return lines.join('\n');
  }

  lines.push(`  ${rem.totalCount} reminder${rem.totalCount !== 1 ? 's' : ''}:`);
  lines.push('');

  for (const list of rem.lists) {
    lines.push(`  \u{1F4CB} ${list.name}`);
    for (const item of list.items) {
      const checkbox = item.completed ? '\u2611\uFE0F' : '\u2610';
      const dueStr = item.dueDate ? ` (due: ${item.dueDate})` : '';
      const priorityStr = item.priority > 0 ? ` [!${item.priority}]` : '';
      lines.push(`    ${checkbox} ${item.title}${dueStr}${priorityStr}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string, locale: string, timezone: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch {
    return dateStr;
  }
}

function formatTimeRange(start: string, end: string, locale: string, timezone: string): string {
  try {
    const opts: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    };
    const s = new Date(start).toLocaleTimeString(locale, opts);
    const e = new Date(end).toLocaleTimeString(locale, opts);
    return `${s}\u2013${e}`;
  } catch {
    return `${start}\u2013${end}`;
  }
}
