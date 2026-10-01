/**
 * Runs a storage read, returning a fallback instead of throwing.
 *
 * Every page is force-dynamic and reads storage while rendering, so one failed
 * query becomes a 500 on the whole route. A page that renders with an empty
 * list and a banner is far more useful than a blank error screen.
 */
export async function safeRead<T>(read: () => T | Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await read();
  } catch (err) {
    console.error(`[storage] ${label} failed:`, err);
    return fallback;
  }
}
