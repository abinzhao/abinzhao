import { expect, test } from 'vitest';
import { createContentIndex } from '../docs/.vitepress/data/content';
import { buildGraph } from '../docs/.vitepress/data/graph-build';
import { graphNeighborhood, layoutGraph, hitNode } from '../examples/site-labs/knowledge-graph';

test('builds typed published relationships without inventing prerequisites', async () => {
  const index = await createContentIndex('docs');
  const graph = buildGraph(index);
  const articles = [...index.blogArticles, ...index.columns.flatMap((column) => column.articles)];
  expect(graph.nodes.filter((node) => node.kind === 'article').map((node) => node.id).sort()).toEqual(articles.map((article) => article.id).sort());
  expect(graph.edges.filter((edge) => edge.kind === 'prerequisite')).toHaveLength(articles.reduce((sum, article) => sum + (article.prerequisites?.length ?? 0), 0));
  const ids = new Set(graph.nodes.map((node) => node.id));
  expect(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
  expect(graph.edges.some((edge) => edge.kind === 'contains')).toBe(true);
});

test('bounds neighborhoods, keeps selected node and produces repeatable finite coordinates', async () => {
  const graph = buildGraph(await createContentIndex('docs'));
  const root = 'column:agent-harness';
  const local = graphNeighborhood(graph, root);
  expect(local.nodes.length).toBeLessThanOrEqual(30);
  expect(local.nodes.some((node) => node.id === root)).toBe(true);
  const points = layoutGraph(local, root);
  expect(layoutGraph(local, root)).toEqual(points);
  expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  expect(hitNode(points, points[0].x, points[0].y)).toBe(points[0].id);
  expect(hitNode(points, -10000, -10000)).toBeUndefined();
  expect(graphNeighborhood(graph, 'missing')).toEqual({ nodes: [], edges: [] });
});
