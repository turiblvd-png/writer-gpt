import { describe, expect, it } from 'vitest';
import { assertPublicUrl, UnsafeUrlError, safeDomain } from './extract';

describe('assertPublicUrl (SSRF guard)', () => {
  it('accepts ordinary public http and https URLs', () => {
    expect(assertPublicUrl('https://en.wikipedia.org/wiki/Six_Kings_Slam').hostname).toBe('en.wikipedia.org');
    expect(assertPublicUrl('http://example.com/a?b=1').hostname).toBe('example.com');
  });

  it.each([
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:8080/'],
    ['localhost', 'http://localhost:3000/'],
    ['private 10.x', 'http://10.0.0.5/'],
    ['private 192.168.x', 'http://192.168.1.1/admin'],
    ['private 172.16-31', 'http://172.20.0.3/'],
    ['CGNAT', 'http://100.100.0.1/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv6 unique-local', 'http://[fd00::1]/'],
    ['.internal suffix', 'http://metadata.internal/'],
  ])('refuses %s', (_label, url) => {
    expect(() => assertPublicUrl(url)).toThrow(UnsafeUrlError);
  });

  it.each([
    ['file', 'file:///etc/passwd'],
    ['gopher', 'gopher://example.com/'],
    ['data', 'data:text/html,<script>1</script>'],
  ])('refuses the %s scheme', (_label, url) => {
    expect(() => assertPublicUrl(url)).toThrow(/Only http and https/);
  });

  it('rejects malformed input rather than passing it to fetch', () => {
    expect(() => assertPublicUrl('not a url')).toThrow(UnsafeUrlError);
  });
});

describe('safeDomain', () => {
  it('strips www and falls back to the raw string when unparseable', () => {
    expect(safeDomain('https://www.netflix.com/tudum/articles/x')).toBe('netflix.com');
    expect(safeDomain('riyadhseason.com')).toBe('riyadhseason.com');
  });
});
