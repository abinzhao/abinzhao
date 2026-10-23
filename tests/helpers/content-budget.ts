import type { PublishedArticleSource } from '../../docs/.vitepress/data/content';

// HEAD 152605af: 119 published articles, 1,278,461 UTF-8 Markdown bytes.
// Retain that release's compression density as the tutorials grow; absolute caps
// still require splitting the lazy payload if the corpus doubles again.
const baselineBytes = 1_278_461;

export function contentBudgets(sources: PublishedArticleSource[]) {
  const sourceBytes = sources.reduce((total, source) => total + Buffer.byteLength(source.markdown), 0);
  const growth = Math.max(1, sourceBytes / baselineBytes);
  return {
    sourceBytes,
    indexGzip: Math.ceil(Math.min(512 * 1024, 250 * 1024 * growth)),
    corpusRaw: Math.ceil(Math.min(4 * 1024 * 1024, 2 * 1024 * 1024 * growth)),
    corpusGzip: Math.ceil(Math.min(1024 * 1024, 600 * 1024 * growth)),
  };
}
