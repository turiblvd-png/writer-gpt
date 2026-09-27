import { marked } from 'marked';

/**
 * Render model-generated markdown to HTML.
 *
 * Raw HTML in the source is escaped rather than passed through: the markdown
 * comes from a language model, and a prompt-injected <script> or <img onerror>
 * would otherwise execute in the editor. We never need raw HTML in an article
 * body, so escaping costs nothing and closes the hole.
 */
marked.setOptions({ gfm: true, breaks: false, async: false });

export function renderMarkdown(markdown: string): string {
  const escaped = markdown.replace(/<(?=[a-zA-Z/!?])/g, '&lt;');
  return marked.parse(escaped) as string;
}
