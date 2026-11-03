import { defineLoader } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { createContentIndex } from './content';
import { buildGraph } from './graph-build';
declare const data: import('../../../examples/site-labs/knowledge-graph').KnowledgeGraph;
export { data };
export default defineLoader({
  watch: ['../../blog/**/*.md', '../../columns/**/*.md'],
  load: async () => buildGraph(await createContentIndex(fileURLToPath(new URL('../../', import.meta.url)))),
});
