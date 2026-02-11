/**
 * Utility for running AppleScript via osascript on macOS.
 */

import { execSync } from 'node:child_process';
import { assertMacOS } from './platform.js';

/**
 * Execute an AppleScript expression and return its stdout as a trimmed string.
 *
 * @param script - The AppleScript source to execute via `osascript -e`.
 * @returns The trimmed stdout produced by the script.
 * @throws If the platform is not macOS or the script fails.
 */
export function runOsascript(script: string): string {
  assertMacOS();

  try {
    const result = execSync(`osascript -e ${escapeForShell(script)}`, {
      timeout: 30_000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return result.trim();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(`osascript execution failed: ${message}`);
  }
}

/**
 * Escape a string so it can be safely passed as a single shell argument
 * wrapped in single quotes.
 */
export function escapeForShell(str: string): string {
  // Wrap in single quotes; escape any internal single quotes with '\''
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
