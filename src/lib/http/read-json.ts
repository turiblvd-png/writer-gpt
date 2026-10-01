/**
 * Reads a server reply as JSON, whatever came back.
 *
 * When a request runs past the host's time limit, or the host itself fails,
 * the reply is a plain-text or HTML error page, not JSON. res.json() then
 * throws "Unexpected token 'A', "An error o"... is not valid JSON", which tells
 * the user nothing. This returns { error } with a plain explanation instead.
 */
export function describeHttpFailure(status: number, body: string): string {
  if (status === 504 || /FUNCTION_INVOCATION_TIMEOUT|timed? ?out|An error occurred/i.test(body)) {
    return 'This step took longer than the hosting time limit and was stopped. Anything already saved is kept. Please try again.';
  }
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 413) return 'That was too large to send. Try a shorter text.';
  if (status === 429) return 'Too many requests at once. Wait a moment and try again.';
  if (status >= 500) return `The server hit an error (HTTP ${status}). Please try again in a minute.`;
  return `Unexpected reply from the server (HTTP ${status}).`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  if (!text) return (res.ok ? {} : { error: describeHttpFailure(res.status, '') }) as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: describeHttpFailure(res.status, text) } as T;
  }
}
