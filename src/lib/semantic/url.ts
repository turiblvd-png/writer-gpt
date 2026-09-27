/**
 * URL helpers safe to import from client components.
 *
 * Kept out of extract.ts deliberately: that module pulls in node-html-parser
 * and does server-side fetching, so importing it from a client component would
 * bundle the parser into the browser payload.
 */
export function safeDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
