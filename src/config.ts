import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BriefingConfig {
  version: 1;
  license?: {
    key: string;
    activatedAt: string;
    fingerprint: string;
    instanceId?: string;
  };
  weather: {
    enabled: boolean;
    location: string;
    units: "metric" | "imperial";
    provider: "wttr" | "open-meteo";
  };
  calendar: {
    enabled: boolean;
    lookaheadDays: number;
    calendars?: string[];
    includeAllDay: boolean;
  };
  news: {
    enabled: boolean;
    feeds: Array<{ name: string; url: string; maxItems: number }>;
  };
  reminders: {
    enabled: boolean;
    lists?: string[];
    includeCompleted: boolean;
  };
  format: {
    template: "default" | "compact" | "json";
    locale: string;
    timezone: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deep merge source into target. Arrays are replaced, not concatenated.
 * Returns a new object without mutating either input.
 */
function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      srcVal !== null &&
      srcVal !== undefined &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal) &&
      tgtVal !== null
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }

  return result;
}

// ─── Config path ─────────────────────────────────────────────────────────────

/**
 * Returns the default config file path:
 *   ~/.config/morning-briefing/config.json
 */
export function getConfigPath(): string {
  return join(homedir(), ".config", "morning-briefing", "config.json");
}

// ─── Default config ──────────────────────────────────────────────────────────

/**
 * Returns a BriefingConfig populated with sensible defaults.
 */
export function getDefaultConfig(): BriefingConfig {
  const resolvedTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return {
    version: 1,
    weather: {
      enabled: true,
      location: "Tokyo",
      units: "metric",
      provider: "wttr",
    },
    calendar: {
      enabled: true,
      lookaheadDays: 1,
      includeAllDay: true,
    },
    news: {
      enabled: true,
      feeds: [],
    },
    reminders: {
      enabled: true,
      includeCompleted: false,
    },
    format: {
      template: "default",
      locale: "en",
      timezone: resolvedTimezone,
    },
  };
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

/**
 * Load config from disk, deep-merging with defaults so that any missing keys
 * are filled in.  If the file does not exist, returns the default config.
 */
export async function loadConfig(
  customPath?: string,
): Promise<BriefingConfig> {
  const configPath = customPath ?? getConfigPath();
  const defaults = getDefaultConfig();

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BriefingConfig>;
    return deepMerge(defaults, parsed) as BriefingConfig;
  } catch (err: unknown) {
    // File not found — perfectly fine, just return defaults
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return defaults;
    }
    // Any other error (bad JSON, permission denied, etc.) should propagate
    throw err;
  }
}

/**
 * Persist a BriefingConfig to disk, creating parent directories when needed.
 */
export async function saveConfig(
  config: BriefingConfig,
  customPath?: string,
): Promise<void> {
  const configPath = customPath ?? getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ─── Interactive init wizard ─────────────────────────────────────────────────

/**
 * Walk the user through an interactive setup, save the result, and return it.
 */
export async function initConfig(): Promise<BriefingConfig> {
  const rl = createInterface({ input, output });
  const config = getDefaultConfig();

  try {
    console.log("\n  Morning Briefing — Setup Wizard\n");

    // ── Weather ────────────────────────────────────────────────────────────
    const location = await rl.question(
      `  Weather location [${config.weather.location}]: `,
    );
    if (location.trim()) {
      config.weather.location = location.trim();
    }

    const unitsInput = await rl.question(
      `  Units (metric / imperial) [${config.weather.units}]: `,
    );
    const unitsNorm = unitsInput.trim().toLowerCase();
    if (unitsNorm === "metric" || unitsNorm === "imperial") {
      config.weather.units = unitsNorm;
    }

    // ── Calendar ───────────────────────────────────────────────────────────
    const calEnable = await rl.question(
      `  Enable calendar module? (yes / no) [yes]: `,
    );
    if (calEnable.trim().toLowerCase().startsWith("n")) {
      config.calendar.enabled = false;
    }

    if (config.calendar.enabled) {
      const lookahead = await rl.question(
        `  Calendar lookahead days [${config.calendar.lookaheadDays}]: `,
      );
      const parsed = Number.parseInt(lookahead.trim(), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        config.calendar.lookaheadDays = parsed;
      }
    }

    // ── News ───────────────────────────────────────────────────────────────
    const newsEnable = await rl.question(
      `  Enable news module? (yes / no) [yes]: `,
    );
    if (newsEnable.trim().toLowerCase().startsWith("n")) {
      config.news.enabled = false;
    }

    if (config.news.enabled) {
      console.log("  Add RSS/Atom feeds (leave name blank to finish):");
      let addingFeeds = true;
      while (addingFeeds) {
        const feedName = await rl.question("    Feed name: ");
        if (!feedName.trim()) {
          addingFeeds = false;
          break;
        }
        const feedUrl = await rl.question("    Feed URL: ");
        if (!feedUrl.trim()) {
          addingFeeds = false;
          break;
        }
        const maxItemsRaw = await rl.question("    Max items [5]: ");
        const maxItems = Number.parseInt(maxItemsRaw.trim(), 10);
        config.news.feeds.push({
          name: feedName.trim(),
          url: feedUrl.trim(),
          maxItems: Number.isNaN(maxItems) || maxItems <= 0 ? 5 : maxItems,
        });
      }
    }

    // ── Format ─────────────────────────────────────────────────────────────
    const templateInput = await rl.question(
      `  Output template (default / compact / json) [${config.format.template}]: `,
    );
    const templateNorm = templateInput.trim().toLowerCase();
    if (
      templateNorm === "default" ||
      templateNorm === "compact" ||
      templateNorm === "json"
    ) {
      config.format.template = templateNorm;
    }

    const localeInput = await rl.question(
      `  Locale [${config.format.locale}]: `,
    );
    if (localeInput.trim()) {
      config.format.locale = localeInput.trim();
    }

    const tzInput = await rl.question(
      `  Timezone [${config.format.timezone}]: `,
    );
    if (tzInput.trim()) {
      config.format.timezone = tzInput.trim();
    }

    // ── Persist ────────────────────────────────────────────────────────────
    await saveConfig(config);
    console.log(`\n  Config saved to ${getConfigPath()}\n`);

    return config;
  } finally {
    rl.close();
  }
}
