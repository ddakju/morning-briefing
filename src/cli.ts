import { createRequire } from 'node:module';
import { Command } from 'commander';
import { runBriefing } from './index.js';
import { loadConfig, initConfig } from './config.js';
import { activateLicense, checkLicenseStatus } from './license.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('briefing')
  .description('Morning Briefing CLI tool for OpenClaw')
  .version(version)
  .option('--format <format>', 'output format (default|compact|json)')
  .option('--location <city>', 'weather location override')
  .option('--days <n>', 'calendar lookahead days', parseInt)
  .option('--config <path>', 'custom config file path')
  .option('--no-color', 'disable colored output')
  .option('--quiet', 'suppress non-essential output');

// Default action: full briefing (all enabled modules)
program
  .action(async (opts) => {
    const globalOpts = program.opts();
    const mergedOpts = { ...globalOpts, ...opts };
    const result = await runBriefing({
      format: mergedOpts.format,
      location: mergedOpts.location,
      days: mergedOpts.days,
      configPath: mergedOpts.config,
      quiet: mergedOpts.quiet,
    });
    process.stdout.write(result.output + '\n');
    process.exitCode = result.exitCode;
  });

// weather subcommand
program
  .command('weather')
  .description('Weather briefing only')
  .action(async () => {
    const globalOpts = program.opts();
    const result = await runBriefing({
      modules: ['weather'],
      format: globalOpts.format,
      location: globalOpts.location,
      days: globalOpts.days,
      configPath: globalOpts.config,
      quiet: globalOpts.quiet,
    });
    process.stdout.write(result.output + '\n');
    process.exitCode = result.exitCode;
  });

// calendar subcommand
program
  .command('calendar')
  .description('Calendar briefing only (paid)')
  .action(async () => {
    const globalOpts = program.opts();
    const result = await runBriefing({
      modules: ['calendar'],
      format: globalOpts.format,
      location: globalOpts.location,
      days: globalOpts.days,
      configPath: globalOpts.config,
      quiet: globalOpts.quiet,
    });
    process.stdout.write(result.output + '\n');
    process.exitCode = result.exitCode;
  });

// news subcommand
program
  .command('news')
  .description('RSS news briefing only (paid)')
  .action(async () => {
    const globalOpts = program.opts();
    const result = await runBriefing({
      modules: ['news'],
      format: globalOpts.format,
      location: globalOpts.location,
      days: globalOpts.days,
      configPath: globalOpts.config,
      quiet: globalOpts.quiet,
    });
    process.stdout.write(result.output + '\n');
    process.exitCode = result.exitCode;
  });

// reminders subcommand
program
  .command('reminders')
  .description('Reminders briefing only (paid)')
  .action(async () => {
    const globalOpts = program.opts();
    const result = await runBriefing({
      modules: ['reminders'],
      format: globalOpts.format,
      location: globalOpts.location,
      days: globalOpts.days,
      configPath: globalOpts.config,
      quiet: globalOpts.quiet,
    });
    process.stdout.write(result.output + '\n');
    process.exitCode = result.exitCode;
  });

// config subcommand
const configCmd = program
  .command('config')
  .description('Show current config');

configCmd
  .action(async () => {
    const globalOpts = program.opts();
    try {
      const config = await loadConfig(globalOpts.config);
      const safeConfig = JSON.parse(JSON.stringify(config));
      if (safeConfig.license?.key) {
        safeConfig.license.key = safeConfig.license.key.slice(0, 7) + '****-****-' + safeConfig.license.key.slice(-4);
      }
      process.stdout.write(JSON.stringify(safeConfig, null, 2) + '\n');
      process.exitCode = 0;
    } catch (err: any) {
      process.stderr.write(`Error loading config: ${err.message}\n`);
      process.exitCode = 1;
    }
  });

// config init subcommand
configCmd
  .command('init')
  .description('Interactive setup wizard')
  .action(async () => {
    try {
      await initConfig();
      process.exitCode = 0;
    } catch (err: any) {
      process.stderr.write(`Error initializing config: ${err.message}\n`);
      process.exitCode = 1;
    }
  });

// activate subcommand
program
  .command('activate <key>')
  .description('Activate license with key')
  .action(async (key: string) => {
    const globalOpts = program.opts();
    try {
      const config = await loadConfig(globalOpts.config);
      const result = await activateLicense(key, config);
      if (result.success) {
        process.stdout.write(`License activated successfully.\n`);
        if (result.message) {
          process.stdout.write(`${result.message}\n`);
        }
        process.exitCode = 0;
      } else {
        process.stderr.write(`License activation failed: ${result.message}\n`);
        process.exitCode = 1;
      }
    } catch (err: any) {
      process.stderr.write(`Error activating license: ${err.message}\n`);
      process.exitCode = 1;
    }
  });

// status subcommand
program
  .command('status')
  .description('Show license and module status')
  .action(async () => {
    const globalOpts = program.opts();
    try {
      const config = await loadConfig(globalOpts.config);
      const status = await checkLicenseStatus(config);
      process.stdout.write(JSON.stringify(status, null, 2) + '\n');
      process.exitCode = 0;
    } catch (err: any) {
      process.stderr.write(`Error checking status: ${err.message}\n`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err: Error) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exitCode = 1;
});
