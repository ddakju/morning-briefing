/**
 * Formatter entry point.
 * Dispatches to the appropriate formatter based on the selected template.
 */

import type { BriefingResult } from '../modules/types.js';
import { formatDefault } from './default.js';
import { formatCompact } from './compact.js';
import { formatJSON } from './json.js';

export type Template = 'default' | 'compact' | 'json';

/**
 * Format a BriefingResult using the specified template.
 *
 * @param result   - The collected briefing data.
 * @param template - Which formatter to use: 'default' (rich), 'compact' (one-line), or 'json'.
 * @param locale   - BCP 47 locale for date/time formatting (e.g. 'ko-KR', 'en-US').
 * @param timezone - IANA timezone (e.g. 'Asia/Seoul', 'America/New_York').
 */
export function formatBriefing(
  result: BriefingResult,
  template: Template = 'default',
  locale: string,
  timezone: string,
): string {
  switch (template) {
    case 'compact':
      return formatCompact(result);
    case 'json':
      return formatJSON(result);
    case 'default':
    default:
      return formatDefault(result, locale, timezone);
  }
}
