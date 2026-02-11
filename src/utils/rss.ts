/**
 * RSS / Atom feed parser.
 * Normalises both RSS 2.0 and Atom feeds into a common item format.
 */

import { XMLParser } from 'fast-xml-parser';

export interface FeedItem {
  title: string;
  link: string;
  date: string;
  summary: string;
}

const MAX_SUMMARY_LENGTH = 200;

/**
 * Parse an RSS 2.0 or Atom XML string and return normalised feed items.
 */
export function parseRSS(xml: string): FeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const doc = parser.parse(xml);

  // RSS 2.0: <rss><channel><item>...</item></channel></rss>
  if (doc.rss?.channel) {
    const items = toArray(doc.rss.channel.item);
    return items.map(parseRSSItem);
  }

  // Atom: <feed><entry>...</entry></feed>
  if (doc.feed?.entry) {
    const entries = toArray(doc.feed.entry);
    return entries.map(parseAtomEntry);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseRSSItem(item: Record<string, unknown>): FeedItem {
  return {
    title: stripHTML(String(item.title ?? '')).trim(),
    link: extractLink(item.link),
    date: String(item.pubDate ?? item['dc:date'] ?? ''),
    summary: truncate(stripHTML(String(item.description ?? item['content:encoded'] ?? ''))),
  };
}

function parseAtomEntry(entry: Record<string, unknown>): FeedItem {
  return {
    title: stripHTML(extractText(entry.title)).trim(),
    link: extractAtomLink(entry.link),
    date: String(entry.updated ?? entry.published ?? ''),
    summary: truncate(stripHTML(extractText(entry.summary ?? entry.content ?? ''))),
  };
}

/**
 * Atom <link> can be an object with @_href or an array of such objects.
 */
function extractAtomLink(link: unknown): string {
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt = link.find(
      (l: Record<string, unknown>) =>
        l['@_rel'] === 'alternate' || !l['@_rel']
    );
    return String((alt ?? link[0])?.['@_href'] ?? '');
  }
  if (typeof link === 'object' && link !== null) {
    return String((link as Record<string, unknown>)['@_href'] ?? '');
  }
  return '';
}

function extractLink(link: unknown): string {
  if (typeof link === 'string') return link;
  if (typeof link === 'object' && link !== null) {
    return String((link as Record<string, unknown>)['#text'] ?? (link as Record<string, unknown>)['@_href'] ?? '');
  }
  return '';
}

/**
 * Atom text content can be a plain string or an object with #text.
 */
function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null) {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

/**
 * Strip HTML tags using a simple regex (no external library).
 */
function stripHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  return text.slice(0, MAX_SUMMARY_LENGTH - 1) + '\u2026';
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
