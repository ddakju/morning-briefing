/**
 * Platform detection utilities.
 * Many modules rely on macOS-specific features (osascript, Calendar.app, Reminders.app).
 */

/**
 * Assert that the current platform is macOS.
 * Throws an error if running on any other OS.
 */
export function assertMacOS(): void {
  if (process.platform !== 'darwin') {
    throw new Error(
      `This feature requires macOS. Current platform: ${process.platform}`
    );
  }
}

/**
 * Check whether the current platform is macOS.
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}
