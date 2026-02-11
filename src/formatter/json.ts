/**
 * JSON formatter for the morning briefing.
 * Outputs the raw BriefingResult as pretty-printed JSON.
 */

import type { BriefingResult } from '../modules/types.js';

/**
 * Format the briefing result as indented JSON.
 */
export function formatJSON(result: BriefingResult): string {
  return JSON.stringify(result, null, 2);
}
