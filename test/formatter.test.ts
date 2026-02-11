import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatBriefing } from '../dist/src/formatter/index.js';
import type { BriefingResult, WeatherData, CalendarData, NewsData, RemindersData } from '../dist/src/modules/types.js';

const mockWeather: WeatherData = {
  location: 'Seoul, Seoul, South Korea',
  current: { temp: 15, feelsLike: 13, condition: 'Partly cloudy', conditionEmoji: '🌤️', humidity: 65, wind: { speed: 12, direction: 'SW' } },
  forecast: [{ date: '2026-02-11', high: 18, low: 8, condition: 'Partly Cloudy', precipChance: 15 }],
  sunrise: '07:15 AM', sunset: '06:10 PM'
};

const mockCalendar: CalendarData = {
  events: [
    { title: 'Team Standup', start: '2026-02-11T09:00:00', end: '2026-02-11T09:30:00', location: 'Zoom', allDay: false, calendar: 'Work' },
  ],
  totalCount: 1
};

const mockResult: BriefingResult = {
  timestamp: '2026-02-11T07:00:00Z',
  weather: mockWeather,
  calendar: mockCalendar,
};

describe('formatBriefing', () => {
  it('formats default template with weather and calendar', () => {
    const output = formatBriefing(mockResult, 'default', 'en', 'Asia/Seoul');
    assert.ok(output.includes('Morning Briefing'));
    assert.ok(output.includes('Seoul'));
    assert.ok(output.includes('15'));
    assert.ok(output.includes('Team Standup'));
  });

  it('formats compact template', () => {
    const output = formatBriefing(mockResult, 'compact', 'en', 'Asia/Seoul');
    assert.ok(output.includes('15°'));
    assert.ok(output.includes('1 event'));
  });

  it('formats json template', () => {
    const output = formatBriefing(mockResult, 'json', 'en', 'Asia/Seoul');
    const parsed = JSON.parse(output);
    assert.equal(parsed.timestamp, '2026-02-11T07:00:00Z');
    assert.ok(parsed.weather);
    assert.ok(parsed.calendar);
  });

  it('handles error modules gracefully in default format', () => {
    const errorResult: BriefingResult = {
      timestamp: '2026-02-11T07:00:00Z',
      weather: { error: 'Network timeout' },
    };
    const output = formatBriefing(errorResult, 'default', 'en', 'Asia/Seoul');
    assert.ok(output.includes('Error'));
    assert.ok(output.includes('Network timeout'));
  });

  it('handles empty result', () => {
    const emptyResult: BriefingResult = { timestamp: '2026-02-11T07:00:00Z' };
    const output = formatBriefing(emptyResult, 'compact', 'en', 'Asia/Seoul');
    assert.equal(output, 'No data available.');
  });
});
