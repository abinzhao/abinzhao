import MarkdownIt from 'markdown-it';
import type { Citation } from './prompt-builder';

export function auditCitations(text: string, citations: Citation[]) {
  const allowed = new Set(citations.map((source) => source.id));
  const ids = [...new Set([...text.matchAll(/\[(S\d+)\]/gu)].map((match) => match[1]))];
  return { valid: ids.filter((id) => allowed.has(id)), invalid: ids.filter((id) => !allowed.has(id)) };
}

export function renderAnswerMarkdown(text: string, citations: Citation[], base: string): string {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const escape = md.utils.escapeHtml;
  const sourceMap = new Map(citations.map((source) => [source.id, source]));
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  const allowedLinks = new Set(citations.flatMap((source) => [source.href, `${prefix}${source.href}`]));
  md.renderer.rules.image = (tokens, index) => escape(tokens[index].content);
  md.renderer.rules.text = (tokens, index) => escape(tokens[index].content).replace(/\[(S\d+)\]/gu, (match, id: string) => {
    const source = sourceMap.get(id);
    return source ? `<a class="chat-citation" href="${escape(`${prefix}${source.href}`)}" title="${escape(source.title)}">[${escape(id)}]</a>` : match;
  });
  const stack: boolean[] = [];
  md.renderer.rules.link_open = (tokens, index) => {
    const href = tokens[index].attrGet('href') ?? '';
    let decoded = href;
    try { decoded = decodeURI(href); } catch { /* malformed links stay disallowed */ }
    const valid = href.startsWith('/') && !href.startsWith('//') && allowedLinks.has(decoded);
    stack.push(valid);
    if (!valid) return '<span>';
    const target = decoded.startsWith(`${prefix}/`) ? decoded : `${prefix}${decoded}`;
    return `<a href="${escape(target)}">`;
  };
  md.renderer.rules.link_close = () => stack.pop() ? '</a>' : '</span>';
  return md.render(text);
}
