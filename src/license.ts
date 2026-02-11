import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

import { type BriefingConfig, saveConfig } from "./config.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Lemon Squeezy license key format: UUID v4 */
const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lemon Squeezy License API base URL */
const LS_LICENSE_API = "https://api.lemonsqueezy.com/v1/licenses";

/**
 * Store & product IDs for validation.
 * Replace with actual values from your Lemon Squeezy dashboard.
 * When set to 0, the check is skipped (useful during initial setup).
 */
const LS_STORE_ID = 0; // TODO: Set your Lemon Squeezy store ID
const LS_PRODUCT_ID = 0; // TODO: Set your Lemon Squeezy product ID

// ─── Fingerprint ─────────────────────────────────────────────────────────────

/**
 * Generate a machine fingerprint from hostname + username + salt.
 * Returns the first 16 hex chars of a SHA-256 digest.
 */
export function generateFingerprint(): string {
  const host = hostname();
  const user = userInfo().username;
  const data = `${host}:${user}:morning-briefing`;
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

// ─── Key validation ──────────────────────────────────────────────────────────

/**
 * Check whether `key` matches the expected UUID format.
 */
export function isValidKeyFormat(key: string): boolean {
  return KEY_PATTERN.test(key);
}

// ─── Activation ──────────────────────────────────────────────────────────────

export interface ActivationResult {
  success: boolean;
  message: string;
}

/**
 * Activate a license key via Lemon Squeezy License API.
 *
 * Flow:
 *   1. Validate key format (UUID)
 *   2. POST /v1/licenses/activate with key + machine fingerprint
 *   3. Verify store_id / product_id ownership
 *   4. Save key + instanceId to local config
 *
 * Falls back to offline activation if the network is unreachable,
 * storing the key locally for later online validation.
 */
export async function activateLicense(
  key: string,
  config: BriefingConfig,
): Promise<ActivationResult> {
  // ── Format check ─────────────────────────────────────────────────────────
  if (!isValidKeyFormat(key)) {
    return {
      success: false,
      message:
        "Invalid license key format. Expected UUID (e.g. 38b1460a-5104-4067-a91d-77b872934d51).",
    };
  }

  const fingerprint = generateFingerprint();

  // ── Lemon Squeezy API call ───────────────────────────────────────────────
  try {
    const res = await fetch(`${LS_LICENSE_API}/activate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        license_key: key,
        instance_name: fingerprint,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as Record<string, any>;

    if (!data.activated) {
      return {
        success: false,
        message: data.error ?? "Activation failed. Please check your license key.",
      };
    }

    // ── Ownership validation ─────────────────────────────────────────────
    if (LS_STORE_ID > 0 && data.meta?.store_id !== LS_STORE_ID) {
      return {
        success: false,
        message: "This license key does not belong to Morning Briefing.",
      };
    }
    if (LS_PRODUCT_ID > 0 && data.meta?.product_id !== LS_PRODUCT_ID) {
      return {
        success: false,
        message: "This license key is for a different product.",
      };
    }

    // ── Save to config ───────────────────────────────────────────────────
    config.license = {
      key,
      activatedAt: new Date().toISOString(),
      fingerprint,
      instanceId: data.instance?.id,
    };

    await saveConfig(config);

    const plan = data.meta?.variant_name ?? "Standard";
    return {
      success: true,
      message: `License activated (${plan}).`,
    };
  } catch (err: any) {
    // ── Offline fallback ─────────────────────────────────────────────────
    // Network unreachable: save key locally, validate next time online.
    config.license = {
      key,
      activatedAt: new Date().toISOString(),
      fingerprint,
    };
    await saveConfig(config);

    return {
      success: true,
      message:
        "License saved (offline). Will validate online when connected.",
    };
  }
}

// ─── Status helpers ──────────────────────────────────────────────────────────

/**
 * Returns `true` if the config contains a license whose key is present and
 * whose fingerprint matches the current machine.
 * Synchronous — no network calls. Used on every briefing run.
 */
export function isLicensed(config: BriefingConfig): boolean {
  if (!config.license) return false;
  if (!config.license.key) return false;
  if (!isValidKeyFormat(config.license.key)) return false;
  return config.license.fingerprint === generateFingerprint();
}

/**
 * Guard: if the user is not licensed, print an upgrade prompt and exit with
 * code 3 so callers can distinguish "not licensed" from other errors.
 */
export function requireLicense(
  config: BriefingConfig,
  feature: string,
): void {
  if (isLicensed(config)) return;

  console.error(
    `\n  The "${feature}" feature requires a license.\n` +
      `  Purchase one at https://morning-briefing.lemonsqueezy.com\n` +
      `  Then run: briefing activate <key>\n`,
  );
  process.exit(3);
}

/**
 * Return a human-readable license status object.
 *
 * Attempts online validation via Lemon Squeezy (5 s timeout).
 * Falls back to local state on network failure.
 */
export async function checkLicenseStatus(
  config: BriefingConfig,
): Promise<Record<string, any>> {
  if (!config.license || !config.license.key) {
    return { status: "demo", message: "No license key. Free tier (weather only)." };
  }

  if (!isValidKeyFormat(config.license.key)) {
    return { status: "demo", message: "Invalid key format stored." };
  }

  if (config.license.fingerprint !== generateFingerprint()) {
    return { status: "expired", message: "Fingerprint mismatch (different machine)." };
  }

  // ── Online validation ──────────────────────────────────────────────────
  try {
    const params: Record<string, string> = {
      license_key: config.license.key,
    };
    if (config.license.instanceId) {
      params.instance_id = config.license.instanceId;
    }

    const res = await fetch(`${LS_LICENSE_API}/validate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(5_000),
    });

    const data = (await res.json()) as Record<string, any>;

    if (data.valid && data.license_key?.status === "active") {
      return {
        status: "licensed",
        plan: data.meta?.variant_name ?? "Standard",
        expiresAt: data.license_key?.expires_at ?? null,
      };
    }

    if (data.license_key?.status === "expired") {
      return { status: "expired", message: "License has expired." };
    }

    if (data.license_key?.status === "disabled") {
      return { status: "disabled", message: "License has been disabled." };
    }

    return {
      status: "invalid",
      message: data.error ?? "License validation failed.",
    };
  } catch {
    // Network error — trust local state
    return {
      status: "licensed",
      message: "Verified locally (offline).",
    };
  }
}
