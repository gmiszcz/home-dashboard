/**
 * localStorage access that never throws. Private mode, a full quota or a blocked
 * storage must not break the dashboard, so every error is handled here once.
 */

/** Raw stored string, or null when missing or storage is unavailable. */
export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stored boolean. Accepts "true"/"1" and "false"/"0", anything else gives the fallback. */
export function readBool(key: string, fallback: boolean): boolean {
  const stored = read(key);
  if (stored === 'true' || stored === '1') return true;
  if (stored === 'false' || stored === '0') return false;
  return fallback;
}

/** Parsed JSON value, or null when missing or invalid. The caller owns the shape check. */
export function readJson<T>(key: string): T | null {
  const raw = read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Stored string when it is one of `allowed`, otherwise the fallback. */
export function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = read(key);
  return allowed.find((value) => value === stored) ?? fallback;
}

/** Store a string. Failures are ignored, the value then lives for this page load only. */
export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full: the preference is not persisted.
  }
}

/** Remove a key. Failures are ignored. */
export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}
