import { loadConfig, type BriefingConfig } from './config.js';
import { isLicensed } from './license.js';
import { fetchWeather } from './modules/weather.js';
import { fetchCalendar } from './modules/calendar.js';
import { fetchNews } from './modules/news.js';
import { fetchReminders } from './modules/reminders.js';
import { formatBriefing, type Template } from './formatter/index.js';
import type { BriefingResult } from './modules/types.js';

const PAID_MODULES = new Set(['calendar', 'news', 'reminders']);
const ALL_MODULES = ['weather', 'calendar', 'news', 'reminders'] as const;

interface RunBriefingOptions {
  modules?: string[];
  format?: string;
  location?: string;
  days?: number;
  configPath?: string;
  quiet?: boolean;
}

export async function runBriefing(options: RunBriefingOptions): Promise<{ output: string; exitCode: number }> {
  const config = await loadConfig(options.configPath);
  const licensed = isLicensed(config);

  // Determine which modules to run
  const requestedModules = options.modules && options.modules.length > 0
    ? options.modules
    : ALL_MODULES.filter((mod) => {
        switch (mod) {
          case 'weather': return config.weather.enabled;
          case 'calendar': return config.calendar.enabled;
          case 'news': return config.news.enabled;
          case 'reminders': return config.reminders.enabled;
          default: return false;
        }
      });

  // Separate licensed vs unlicensed modules
  const licensedModules: string[] = [];
  const licenseErrors: Map<string, string> = new Map();

  for (const mod of requestedModules) {
    if (PAID_MODULES.has(mod) && !licensed) {
      licenseErrors.set(mod, `The "${mod}" module requires a license. Purchase at https://morning-briefing.lemonsqueezy.com`);
    } else {
      licensedModules.push(mod);
    }
  }

  // Apply CLI overrides
  const location = options.location ?? config.weather.location;
  const units = config.weather.units;
  const lookaheadDays = options.days ?? config.calendar.lookaheadDays;

  // Run enabled+licensed modules in parallel
  const runners: Array<{ name: string; promise: Promise<unknown> }> = [];

  for (const mod of licensedModules) {
    switch (mod) {
      case 'weather':
        runners.push({ name: 'weather', promise: fetchWeather(location, units, config.weather.provider) });
        break;
      case 'calendar':
        runners.push({ name: 'calendar', promise: fetchCalendar({
          lookaheadDays,
          calendars: config.calendar.calendars,
          includeAllDay: config.calendar.includeAllDay,
        }) });
        break;
      case 'news':
        runners.push({ name: 'news', promise: fetchNews(config.news.feeds) });
        break;
      case 'reminders':
        runners.push({ name: 'reminders', promise: fetchReminders({
          lists: config.reminders.lists,
          includeCompleted: config.reminders.includeCompleted,
        }) });
        break;
    }
  }

  const results = await Promise.allSettled(runners.map(r => r.promise));

  // Assemble BriefingResult
  const briefingResult: BriefingResult = {
    timestamp: new Date().toISOString(),
  };

  let someModulesFailed = false;

  results.forEach((result, index) => {
    const name = runners[index].name as keyof Omit<BriefingResult, 'timestamp'>;
    if (result.status === 'fulfilled') {
      (briefingResult as any)[name] = result.value;
    } else {
      someModulesFailed = true;
      (briefingResult as any)[name] = {
        error: result.reason?.message ?? String(result.reason),
      };
    }
  });

  // Add license errors
  for (const [mod, message] of licenseErrors) {
    (briefingResult as any)[mod] = { error: message };
  }

  // Format output
  const template = (options.format ?? config.format.template) as Template;
  const output = formatBriefing(briefingResult, template, config.format.locale, config.format.timezone);

  // Determine exit code
  let exitCode = 0;
  if (licenseErrors.size > 0) {
    exitCode = 3;
  } else if (someModulesFailed) {
    exitCode = 1;
  }

  return { output, exitCode };
}
