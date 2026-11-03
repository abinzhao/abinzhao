import type { ContentIndex } from './content';
import { experiments } from './labs';
import type { KnowledgeGraph } from '../../../examples/site-labs/knowledge-graph';

export function buildGraph(index: ContentIndex): KnowledgeGraph {
  const graph: KnowledgeGraph = { nodes: [], edges: [] };
  const published = [...index.blogArticles, ...index.columns.flatMap((column) => column.articles)].filter((article) => !article.draft);
  const ids = new Set(published.map((article) => article.id));
  for (const column of index.columns) {
    graph.nodes.push({ id: `column:${column.slug}`, title: column.title, href: column.href, kind: 'column' });
    for (const article of column.articles) if (ids.has(article.id)) graph.edges.push({ from: `column:${column.slug}`, to: article.id, kind: 'contains' });
  }
  for (const lab of experiments) graph.nodes.push({ id: `lab:${lab.id}`, title: lab.title, href: `/labs/${lab.id}.html`, kind: 'experiment' });
  for (const article of published) {
    graph.nodes.push({ id: article.id, title: article.title, href: article.href, kind: 'article' });
    for (const prerequisite of article.prerequisites ?? []) if (ids.has(prerequisite)) graph.edges.push({ from: prerequisite, to: article.id, kind: 'prerequisite' });
    for (const id of article.demoIds ?? []) graph.edges.push({ from: article.id, to: `lab:${id}`, kind: 'demo' });
  }
  return graph;
}
