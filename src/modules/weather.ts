/**
 * Weather data module.
 * Primary source: wttr.in (no API key required).
 * Fallback: Open-Meteo API (no API key required).
 */

import type { WeatherData } from './types.js';

const TIMEOUT_MS = 10_000;

export type WeatherProvider = 'wttr' | 'open-meteo';

/**
 * Fetch current weather and forecast for the given location.
 *
 * @param location - City name, coordinates, or any wttr.in-compatible query.
 * @param units    - `'metric'` (Celsius, km/h) or `'imperial'` (Fahrenheit, mph).
 * @param provider - `'wttr'` tries wttr.in first with open-meteo fallback;
 *                   `'open-meteo'` goes directly to Open-Meteo.
 */
export async function fetchWeather(
  location: string,
  units: 'metric' | 'imperial' = 'metric',
  provider: WeatherProvider = 'wttr',
): Promise<WeatherData> {
  if (provider === 'open-meteo') {
    return fetchFromOpenMeteo(location, units);
  }

  // wttr → open-meteo fallback
  try {
    return await fetchFromWttr(location, units);
  } catch {
    return fetchFromOpenMeteo(location, units);
  }
}

// ---------------------------------------------------------------------------
// wttr.in provider
// ---------------------------------------------------------------------------

async function fetchFromWttr(
  location: string,
  units: 'metric' | 'imperial',
): Promise<WeatherData> {
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'morning-briefing-cli/1.0' },
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    throw new Error(
      `Failed to fetch weather from wttr.in: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`wttr.in responded with HTTP ${res.status}`);
  }

  const data = await res.json() as WttrResponse;

  return mapWttrResponse(data, units);
}

// ---------------------------------------------------------------------------
// Open-Meteo provider
// ---------------------------------------------------------------------------

async function fetchFromOpenMeteo(
  location: string,
  units: 'metric' | 'imperial',
): Promise<WeatherData> {
  const { latitude, longitude, name, country } = await geocode(location);

  const imperial = units === 'imperial';
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
      'weather_code', 'wind_speed_10m', 'wind_direction_10m',
    ].join(','),
    daily: [
      'temperature_2m_max', 'temperature_2m_min',
      'precipitation_probability_max', 'weather_code',
      'sunrise', 'sunset',
    ].join(','),
    timezone: 'auto',
    forecast_days: '3',
  });
  if (imperial) {
    params.set('temperature_unit', 'fahrenheit');
    params.set('wind_speed_unit', 'mph');
  }

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const data = await fetchJson<OpenMeteoForecast>(url);

  return mapOpenMeteoResponse(data, `${name}, ${country}`);
}

interface GeocodingResult {
  latitude: number;
  longitude: number;
  name: string;
  country: string;
}

async function geocode(location: string): Promise<GeocodingResult> {
  // If location looks like coordinates (e.g. "35.6762,139.6503"), parse directly
  const coordMatch = location.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    return {
      latitude: Number(coordMatch[1]),
      longitude: Number(coordMatch[2]),
      name: location,
      country: '',
    };
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`;
  const data = await fetchJson<{ results?: Array<{ latitude: number; longitude: number; name: string; country: string }> }>(url);

  if (!data.results || data.results.length === 0) {
    throw new Error(`Could not geocode location: "${location}"`);
  }

  const r = data.results[0];
  return { latitude: r.latitude, longitude: r.longitude, name: r.name, country: r.country };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'morning-briefing-cli/1.0' },
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    throw new Error(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// wttr.in JSON types (subset)
// ---------------------------------------------------------------------------

interface WttrResponse {
  current_condition: WttrCurrentCondition[];
  weather: WttrWeatherDay[];
  nearest_area: WttrNearestArea[];
}

interface WttrCurrentCondition {
  temp_C: string;
  temp_F: string;
  FeelsLikeC: string;
  FeelsLikeF: string;
  weatherCode: string;
  weatherDesc: { value: string }[];
  humidity: string;
  windspeedKmph: string;
  windspeedMiles: string;
  winddir16Point: string;
}

interface WttrWeatherDay {
  date: string;
  maxtempC: string;
  maxtempF: string;
  mintempC: string;
  mintempF: string;
  hourly: { weatherCode: string; chanceofrain: string }[];
  astronomy: { sunrise: string; sunset: string }[];
}

interface WttrNearestArea {
  areaName: { value: string }[];
  country: { value: string }[];
  region: { value: string }[];
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapWttrResponse(data: WttrResponse, units: 'metric' | 'imperial'): WeatherData {
  const cc = data.current_condition[0];
  const area = data.nearest_area[0];
  const imperial = units === 'imperial';

  const condition = cc.weatherDesc[0]?.value ?? 'Unknown';
  const conditionEmoji = weatherCodeToEmoji(cc.weatherCode);

  const locationName = [
    area.areaName[0]?.value,
    area.region[0]?.value,
    area.country[0]?.value,
  ]
    .filter(Boolean)
    .join(', ');

  const forecast = data.weather.map((day) => {
    // Use the max chance-of-rain across all hourly entries as the day's precip chance.
    const maxPrecip = day.hourly.reduce(
      (max, h) => Math.max(max, Number(h.chanceofrain) || 0),
      0,
    );
    // Derive a representative condition from the most common weatherCode in hourly data.
    const representativeCode = mostFrequent(day.hourly.map((h) => h.weatherCode));

    return {
      date: day.date,
      high: Number(imperial ? day.maxtempF : day.maxtempC),
      low: Number(imperial ? day.mintempF : day.mintempC),
      condition: weatherCodeToDescription(representativeCode),
      precipChance: maxPrecip,
    };
  });

  const astronomy = data.weather[0]?.astronomy[0];

  return {
    location: locationName,
    current: {
      temp: Number(imperial ? cc.temp_F : cc.temp_C),
      feelsLike: Number(imperial ? cc.FeelsLikeF : cc.FeelsLikeC),
      condition,
      conditionEmoji,
      humidity: Number(cc.humidity),
      wind: {
        speed: Number(imperial ? cc.windspeedMiles : cc.windspeedKmph),
        direction: cc.winddir16Point,
      },
    },
    forecast,
    sunrise: astronomy?.sunrise ?? '',
    sunset: astronomy?.sunset ?? '',
  };
}

// ---------------------------------------------------------------------------
// Weather code → emoji / description mapping
// See: https://www.worldweatheronline.com/developer/api/docs/weather-icons.aspx
// ---------------------------------------------------------------------------

const WEATHER_EMOJI_MAP: Record<string, string> = {
  '113': '\u2600\uFE0F',   // Sunny / Clear
  '116': '\uD83C\uDF24\uFE0F', // Partly cloudy
  '119': '\u2601\uFE0F',   // Cloudy
  '122': '\u2601\uFE0F',   // Overcast
  '143': '\uD83C\uDF2B\uFE0F', // Mist
  '176': '\uD83C\uDF27\uFE0F', // Patchy rain
  '179': '\uD83C\uDF28\uFE0F', // Patchy snow
  '182': '\uD83C\uDF27\uFE0F', // Patchy sleet
  '185': '\uD83C\uDF27\uFE0F', // Patchy freezing drizzle
  '200': '\u26C8\uFE0F',   // Thundery outbreaks
  '227': '\uD83C\uDF28\uFE0F', // Blowing snow
  '230': '\uD83C\uDF28\uFE0F', // Blizzard
  '248': '\uD83C\uDF2B\uFE0F', // Fog
  '260': '\uD83C\uDF2B\uFE0F', // Freezing fog
  '263': '\uD83C\uDF27\uFE0F', // Patchy light drizzle
  '266': '\uD83C\uDF27\uFE0F', // Light drizzle
  '281': '\uD83C\uDF27\uFE0F', // Freezing drizzle
  '284': '\uD83C\uDF27\uFE0F', // Heavy freezing drizzle
  '293': '\uD83C\uDF27\uFE0F', // Patchy light rain
  '296': '\uD83C\uDF27\uFE0F', // Light rain
  '299': '\uD83C\uDF27\uFE0F', // Moderate rain at times
  '302': '\uD83C\uDF27\uFE0F', // Moderate rain
  '305': '\uD83C\uDF27\uFE0F', // Heavy rain at times
  '308': '\uD83C\uDF27\uFE0F', // Heavy rain
  '311': '\uD83C\uDF27\uFE0F', // Light freezing rain
  '314': '\uD83C\uDF27\uFE0F', // Moderate/heavy freezing rain
  '317': '\uD83C\uDF27\uFE0F', // Light sleet
  '320': '\uD83C\uDF27\uFE0F', // Moderate/heavy sleet
  '323': '\uD83C\uDF28\uFE0F', // Patchy light snow
  '326': '\uD83C\uDF28\uFE0F', // Light snow
  '329': '\uD83C\uDF28\uFE0F', // Patchy moderate snow
  '332': '\uD83C\uDF28\uFE0F', // Moderate snow
  '335': '\uD83C\uDF28\uFE0F', // Patchy heavy snow
  '338': '\uD83C\uDF28\uFE0F', // Heavy snow
  '350': '\uD83C\uDF27\uFE0F', // Ice pellets
  '353': '\uD83C\uDF27\uFE0F', // Light rain shower
  '356': '\uD83C\uDF27\uFE0F', // Moderate/heavy rain shower
  '359': '\uD83C\uDF27\uFE0F', // Torrential rain shower
  '362': '\uD83C\uDF27\uFE0F', // Light sleet showers
  '365': '\uD83C\uDF27\uFE0F', // Moderate/heavy sleet showers
  '368': '\uD83C\uDF28\uFE0F', // Light snow showers
  '371': '\uD83C\uDF28\uFE0F', // Moderate/heavy snow showers
  '374': '\uD83C\uDF27\uFE0F', // Light showers of ice pellets
  '377': '\uD83C\uDF27\uFE0F', // Moderate/heavy ice pellets
  '386': '\u26C8\uFE0F',   // Patchy light rain with thunder
  '389': '\u26C8\uFE0F',   // Moderate/heavy rain with thunder
  '392': '\u26C8\uFE0F',   // Patchy light snow with thunder
  '395': '\u26C8\uFE0F',   // Moderate/heavy snow with thunder
};

const WEATHER_DESC_MAP: Record<string, string> = {
  '113': 'Clear',
  '116': 'Partly Cloudy',
  '119': 'Cloudy',
  '122': 'Overcast',
  '143': 'Mist',
  '176': 'Patchy Rain',
  '200': 'Thunderstorm',
  '227': 'Snow',
  '230': 'Blizzard',
  '248': 'Fog',
  '260': 'Freezing Fog',
  '296': 'Light Rain',
  '302': 'Rain',
  '308': 'Heavy Rain',
  '326': 'Light Snow',
  '332': 'Snow',
  '338': 'Heavy Snow',
};

function weatherCodeToEmoji(code: string): string {
  return WEATHER_EMOJI_MAP[code] ?? '\u2601\uFE0F'; // default: cloudy
}

function weatherCodeToDescription(code: string): string {
  return WEATHER_DESC_MAP[code] ?? 'Unknown';
}

function mostFrequent(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = arr[0] ?? '113';
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Open-Meteo JSON types (subset)
// ---------------------------------------------------------------------------

interface OpenMeteoForecast {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
  };
}

// ---------------------------------------------------------------------------
// Open-Meteo → WeatherData mapping
// ---------------------------------------------------------------------------

function mapOpenMeteoResponse(
  data: OpenMeteoForecast,
  locationName: string,
): WeatherData {
  const c = data.current;
  const wmoCode = c.weather_code;

  const forecast = data.daily.time.map((date, i) => ({
    date,
    high: data.daily.temperature_2m_max[i],
    low: data.daily.temperature_2m_min[i],
    condition: wmoToDescription(data.daily.weather_code[i]),
    precipChance: data.daily.precipitation_probability_max[i] ?? 0,
  }));

  // Extract time portion from ISO sunrise/sunset
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
  };

  return {
    location: locationName,
    current: {
      temp: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      condition: wmoToDescription(wmoCode),
      conditionEmoji: wmoToEmoji(wmoCode),
      humidity: c.relative_humidity_2m,
      wind: {
        speed: c.wind_speed_10m,
        direction: degreesToCompass(c.wind_direction_10m),
      },
    },
    forecast,
    sunrise: data.daily.sunrise[0] ? formatTime(data.daily.sunrise[0]) : '',
    sunset: data.daily.sunset[0] ? formatTime(data.daily.sunset[0]) : '',
  };
}

// ---------------------------------------------------------------------------
// WMO Weather Code mappings (Open-Meteo uses WMO codes)
// https://open-meteo.com/en/docs#weathervariables
// ---------------------------------------------------------------------------

const WMO_EMOJI_MAP: Record<number, string> = {
  0: '\u2600\uFE0F',         // Clear sky
  1: '\uD83C\uDF24\uFE0F',   // Mainly clear
  2: '\u26C5',               // Partly cloudy
  3: '\u2601\uFE0F',         // Overcast
  45: '\uD83C\uDF2B\uFE0F',  // Fog
  48: '\uD83C\uDF2B\uFE0F',  // Depositing rime fog
  51: '\uD83C\uDF27\uFE0F',  // Light drizzle
  53: '\uD83C\uDF27\uFE0F',  // Moderate drizzle
  55: '\uD83C\uDF27\uFE0F',  // Dense drizzle
  56: '\uD83C\uDF27\uFE0F',  // Light freezing drizzle
  57: '\uD83C\uDF27\uFE0F',  // Dense freezing drizzle
  61: '\uD83C\uDF27\uFE0F',  // Slight rain
  63: '\uD83C\uDF27\uFE0F',  // Moderate rain
  65: '\uD83C\uDF27\uFE0F',  // Heavy rain
  66: '\uD83C\uDF27\uFE0F',  // Light freezing rain
  67: '\uD83C\uDF27\uFE0F',  // Heavy freezing rain
  71: '\uD83C\uDF28\uFE0F',  // Slight snow
  73: '\uD83C\uDF28\uFE0F',  // Moderate snow
  75: '\uD83C\uDF28\uFE0F',  // Heavy snow
  77: '\uD83C\uDF28\uFE0F',  // Snow grains
  80: '\uD83C\uDF27\uFE0F',  // Slight rain showers
  81: '\uD83C\uDF27\uFE0F',  // Moderate rain showers
  82: '\uD83C\uDF27\uFE0F',  // Violent rain showers
  85: '\uD83C\uDF28\uFE0F',  // Slight snow showers
  86: '\uD83C\uDF28\uFE0F',  // Heavy snow showers
  95: '\u26C8\uFE0F',        // Thunderstorm
  96: '\u26C8\uFE0F',        // Thunderstorm with slight hail
  99: '\u26C8\uFE0F',        // Thunderstorm with heavy hail
};

const WMO_DESC_MAP: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  56: 'Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Rain Showers',
  81: 'Rain Showers',
  82: 'Heavy Rain Showers',
  85: 'Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

function wmoToEmoji(code: number): string {
  return WMO_EMOJI_MAP[code] ?? '\u2601\uFE0F';
}

function wmoToDescription(code: number): string {
  return WMO_DESC_MAP[code] ?? 'Unknown';
}

function degreesToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
