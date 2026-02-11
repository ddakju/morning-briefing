/**
 * News / RSS feed aggregation module.
 */

import { parseRSS } from '../utils/rss.js';
import type { NewsData } from './types.js';

const FEED_TIMEOUT_MS = 10_000;

export interface FeedSource {
  name: string;
  url: string;
  maxItems: number;
}

/**
 * Fetch and parse multiple RSS/Atom feeds in parallel.
 * Individual feed failures are captured per-feed rather than failing the whole call.
 */
export async function fetchNews(feeds: FeedSource[]): Promise<NewsData> {
  const results = await Promise.allSettled(feeds.map((feed) => fetchSingleFeed(feed)));

  const feedResults = results.map((result, idx) => {
    const feed = feeds[idx];
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      name: feed.name,
      items: [] as Array<{ title: string; link: string; date: string; summary: string }>,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  return { feeds: feedResults };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function fetchSingleFeed(
  feed: FeedSource,
): Promise<{
  name: string;
  items: Array<{ title: string; link: string; date: string; summary: string }>;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'morning-briefing-cli/1.0' },
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    throw new Error(
      `Failed to fetch feed "${feed.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Feed "${feed.name}" returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  const allItems = parseRSS(xml);
  const items = allItems.slice(0, feed.maxItems);

  return { name: feed.name, items };
}
