/**
 * Models wrap JSON in prose or code fences even when asked not to. Recover the
 * object rather than failing a run that is otherwise fine.
 */
export function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();

  const candidates = [
    trimmed,
    /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1],
    sliceBalanced(trimmed, '{', '}'),
    sliceBalanced(trimmed, '[', ']'),
  ].filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next shape
    }
  }
  throw new Error(`Model did not return parseable JSON. Received: ${trimmed.slice(0, 300)}`);
}

/** Take the first balanced {...} or [...] block, ignoring braces inside strings. */
function sliceBalanced(text: string, open: string, close: string): string | undefined {
  const start = text.indexOf(open);
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}
