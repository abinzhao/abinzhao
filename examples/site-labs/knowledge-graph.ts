export interface GraphNode { id: string; title: string; href: string; kind: 'article' | 'column' | 'experiment' }
export interface GraphEdge { from: string; to: string; kind: 'contains' | 'prerequisite' | 'demo' }
export interface KnowledgeGraph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface GraphPoint { id: string; x: number; y: number }

/** 广度优先保留直接关系，再展开同专题；截断不会改变边的含义。 */
export function graphNeighborhood(graph: KnowledgeGraph, root: string, limit = 30): KnowledgeGraph {
  if (!graph.nodes.some((node) => node.id === root)) return { nodes: [], edges: [] };
  const ids = new Set([root]);
  const queue = [root];
  const edges = [...graph.edges].sort((a, b) => {
    const priority = { prerequisite: 0, demo: 1, contains: 2 };
    return priority[a.kind] - priority[b.kind] || a.to.localeCompare(b.to);
  });
  for (const id of queue) {
    for (const edge of edges) {
      const neighbor = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
      if (!neighbor || ids.has(neighbor) || ids.size >= limit) continue;
      ids.add(neighbor);
      queue.push(neighbor);
    }
  }
  return { nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
}

/** 固定 seed + 固定迭代次数；Worker 每次完成一个有限布局后即可销毁。 */
export function layoutGraph(graph: KnowledgeGraph, root: string): GraphPoint[] {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const points = nodes.map((node, index) => {
    let seed = 2166136261;
    for (const character of node.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    const angle = index * 2.399963 + (seed % 100) / 1000;
    const radius = 70 + 35 * Math.sqrt(index);
    return { id: node.id, x: node.id === root ? 0 : Math.cos(angle) * radius, y: node.id === root ? 0 : Math.sin(angle) * radius };
  });
  const byId = new Map(points.map((point) => [point.id, point]));
  for (let iteration = 0; iteration < 100; iteration++) {
    const forces = points.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x || .01;
        const dy = points[i].y - points[j].y || .01;
        const distance = Math.hypot(dx, dy);
        const strength = Math.min(6, 1800 / (distance * distance));
        forces[i].x += dx / distance * strength; forces[i].y += dy / distance * strength;
        forces[j].x -= dx / distance * strength; forces[j].y -= dy / distance * strength;
      }
    }
    for (const edge of graph.edges) {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - 140) * .012;
      const i = points.indexOf(a), j = points.indexOf(b);
      forces[i].x += dx / distance * force; forces[i].y += dy / distance * force;
      forces[j].x -= dx / distance * force; forces[j].y -= dy / distance * force;
    }
    points.forEach((point, index) => {
      if (point.id === root) return;
      point.x += Math.max(-8, Math.min(8, forces[index].x)) - point.x * .002;
      point.y += Math.max(-8, Math.min(8, forces[index].y)) - point.y * .002;
    });
  }
  return points;
}

export function hitNode(points: GraphPoint[], x: number, y: number, radius = 22) {
  return points.reduce<GraphPoint | undefined>((nearest, point) =>
    Math.hypot(point.x - x, point.y - y) <= radius &&
    (!nearest || Math.hypot(point.x - x, point.y - y) < Math.hypot(nearest.x - x, nearest.y - y)) ? point : nearest, undefined)?.id;
}
