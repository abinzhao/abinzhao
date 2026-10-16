import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { getKnowledgeArtifacts } from './knowledge-build';

const contentRoot = fileURLToPath(new URL('../../', import.meta.url));

export type { KnowledgeIndexArtifact } from './knowledge';
declare const data: import('./knowledge').KnowledgeIndexArtifact;
export { data };

export default defineLoader({
  watch: ['../../blog/**/*.md', '../../columns/**/*.md', '../../../examples/agent-harness/**/*.mjs', '../../../examples/agent-harness/web/*.html', '../../../examples/agent-harness/package.json'],
  async load() {
    return (await getKnowledgeArtifacts(contentRoot)).index;
  },
});
