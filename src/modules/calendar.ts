/**
 * Calendar module.
 * Reads events from macOS Calendar.app via osascript (AppleScript).
 */

import { runOsascript } from '../utils/osascript.js';
import type { CalendarData } from './types.js';

const FIELD_SEP = '|~|';
const RECORD_SEP = '\n';

export interface CalendarOptions {
  /** Number of days to look ahead (default: 1 = today only). */
  lookaheadDays?: number;
  /** Only include events from these calendars (by name). Empty = all. */
  calendars?: string[];
  /** Whether to include all-day events (default: true). */
  includeAllDay?: boolean;
}

/**
 * Fetch upcoming calendar events from Calendar.app.
 */
export async function fetchCalendar(
  options: CalendarOptions = {},
): Promise<CalendarData> {
  const { lookaheadDays = 1, calendars, includeAllDay = true } = options;

  const script = buildAppleScript(lookaheadDays);
  const raw = runOsascript(script);

  if (!raw) {
    return { events: [], totalCount: 0 };
  }

  const lines = raw.split(RECORD_SEP).filter((l) => l.trim() !== '');

  let events = lines.map(parseLine).filter((e): e is NonNullable<typeof e> => e !== null);

  // Filter by calendar name if requested.
  if (calendars && calendars.length > 0) {
    const allowed = new Set(calendars.map((c) => c.toLowerCase()));
    events = events.filter((e) => allowed.has(e.calendar.toLowerCase()));
  }

  // Optionally exclude all-day events.
  if (!includeAllDay) {
    events = events.filter((e) => !e.allDay);
  }

  // Sort by start time.
  events.sort((a, b) => {
    const da = new Date(a.start).getTime();
    const db = new Date(b.start).getTime();
    return da - db;
  });

  return { events, totalCount: events.length };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildAppleScript(lookaheadDays: number): string {
  // AppleScript that collects events from Calendar.app.
  // We compute start/end dates inside AS and iterate over calendars & events.
  return `
set fieldSep to "${FIELD_SEP}"
set recSep to "\n"
set output to ""

set todayStart to current date
set time of todayStart to 0

set endDate to todayStart + (${lookaheadDays} * days)

tell application "Calendar"
  repeat with cal in calendars
    set calName to name of cal
    set evts to (every event of cal whose start date >= todayStart and start date < endDate)
    repeat with evt in evts
      set evtTitle to summary of evt
      set evtStart to start date of evt
      set evtEnd to end date of evt
      set evtLoc to ""
      try
        set evtLoc to location of evt
      end try
      if evtLoc is missing value then set evtLoc to ""
      set evtAllDay to allday event of evt
      set output to output & evtTitle & fieldSep & (evtStart as string) & fieldSep & (evtEnd as string) & fieldSep & evtLoc & fieldSep & evtAllDay & fieldSep & calName & recSep
    end repeat
  end repeat
end tell

return output
`.trim();
}

function parseLine(
  line: string,
): {
  title: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  calendar: string;
} | null {
  const parts = line.split(FIELD_SEP);
  if (parts.length < 6) return null;

  const [title, start, end, location, allDayStr, calendar] = parts;

  return {
    title: title.trim(),
    start: start.trim(),
    end: end.trim(),
    location: location.trim() || undefined,
    allDay: allDayStr.trim().toLowerCase() === 'true',
    calendar: calendar.trim(),
  };
}
