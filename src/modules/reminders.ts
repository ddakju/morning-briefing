/**
 * Reminders module.
 * Reads reminders from macOS Reminders.app via osascript (JXA).
 * Uses batch property access for performance.
 */

import { execSync } from 'node:child_process';
import { assertMacOS } from '../utils/platform.js';
import { escapeForShell } from '../utils/osascript.js';
import type { RemindersData } from './types.js';

export interface RemindersOptions {
  /** Only query these reminder lists (by name). Empty = all. */
  lists?: string[];
  /** Include completed reminders (default: false). */
  includeCompleted?: boolean;
}

/**
 * Fetch reminders from Reminders.app using JXA with batch property access.
 */
export async function fetchReminders(
  options: RemindersOptions = {},
): Promise<RemindersData> {
  assertMacOS();

  const { lists: requestedLists, includeCompleted = false } = options;

  const script = buildJXAScript(requestedLists, includeCompleted);

  let raw: string;
  try {
    raw = execSync(`osascript -l JavaScript -e ${escapeForShell(script)}`, {
      timeout: 30_000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`osascript execution failed: ${message}`);
  }

  if (!raw) {
    return { lists: [], totalCount: 0 };
  }

  const parsed = JSON.parse(raw) as Array<{
    listName: string;
    items: Array<{ title: string; dueDate: string; completed: boolean; priority: number }>;
  }>;

  const lists = parsed.map((l) => ({
    name: l.listName,
    items: l.items.map((item) => ({
      title: item.title,
      dueDate: item.dueDate || undefined,
      completed: item.completed,
      priority: item.priority,
    })),
  }));

  const totalCount = lists.reduce((sum, l) => sum + l.items.length, 0);

  return { lists, totalCount };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildJXAScript(
  requestedLists: string[] | undefined,
  includeCompleted: boolean,
): string {
  const listFilter = requestedLists && requestedLists.length > 0
    ? `const filterLists = new Set(${JSON.stringify(requestedLists)});`
    : 'const filterLists = null;';

  return `
const app = Application("Reminders");
${listFilter}
const allLists = app.lists();
const result = [];
for (const list of allLists) {
  const listName = list.name();
  if (filterLists && !filterLists.has(listName)) continue;
  const query = ${includeCompleted ? 'list.reminders' : 'list.reminders.whose({completed: false})'};
  const rems = query();
  if (rems.length === 0) continue;
  const names = query.name();
  const priorities = query.priority();
  const completeds = query.completed();
  const dueDates = query.dueDate();
  const items = [];
  for (let i = 0; i < names.length; i++) {
    const dd = dueDates[i];
    items.push({
      title: names[i] || "",
      dueDate: dd ? dd.toISOString() : "",
      completed: completeds[i] || false,
      priority: priorities[i] || 0
    });
  }
  result.push({ listName, items });
}
JSON.stringify(result);
`.trim();
}

