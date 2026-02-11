import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRSS } from '../dist/src/utils/rss.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('parseRSS', () => {
  it('parses RSS 2.0 feed correctly', () => {
    const xml = readFileSync(join(__dirname, 'fixtures/rss-sample.xml'), 'utf-8');
    const items = parseRSS(xml);
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Article One');
    assert.equal(items[0].link, 'https://example.com/1');
    assert.ok(items[0].summary.length > 0);
  });

  it('strips HTML from summary', () => {
    const xml = readFileSync(join(__dirname, 'fixtures/rss-sample.xml'), 'utf-8');
    const items = parseRSS(xml);
    assert.ok(!items[1].summary.includes('<p>'));
    assert.ok(!items[1].summary.includes('<b>'));
  });

  it('parses Atom feed correctly', () => {
    const xml = readFileSync(join(__dirname, 'fixtures/rss-atom.xml'), 'utf-8');
    const items = parseRSS(xml);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Atom Entry One');
    assert.equal(items[0].link, 'https://example.com/atom/1');
  });

  it('returns empty array for invalid XML', () => {
    const items = parseRSS('not xml at all');
    assert.equal(items.length, 0);
  });
});
