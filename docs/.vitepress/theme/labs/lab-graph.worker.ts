import { layoutGraph, type KnowledgeGraph } from '../../../../examples/site-labs/knowledge-graph';
self.onmessage = (event: MessageEvent<{ graph: KnowledgeGraph; root: string }>) => {
  self.postMessage(layoutGraph(event.data.graph, event.data.root));
};
