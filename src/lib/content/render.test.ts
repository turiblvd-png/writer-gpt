import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  it('renders headings, lists and tables', () => {
    const html = renderMarkdown('## Heading\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<table>');
  });

  it('escapes raw HTML so injected markup cannot execute', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> and <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps markdown emphasis and links working', () => {
    const html = renderMarkdown('**bold** and [link](https://example.com)');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
  });
});
