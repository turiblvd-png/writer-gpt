/**
 * Runs a storage read, returning a fallback instead of throwing.
 *
 * Every page in this app is force-dynamic and reads storage while rendering, so
 * one failed query becomes a 500 on the whole route. That is how a read-only
 * filesystem turned the entire deployment into "Application error". A page that
 * renders with an empty list and a banner is far more useful than a blank
 * error screen.
 */
export function safeRead<T>(read: () => T, fallback: T, label: string): T {
  try {
    return read();
  } catch (err) {
    console.error(`[storage] ${label} failed:`, err);
    return fallback;
  }
}
