import { defineLoader } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { createContentIndex } from './content';

const contentRoot = fileURLToPath(new URL('../../', import.meta.url));

export type { ContentIndex } from './content';
declare const data: import('./content').ContentIndex;
export { data };

export default defineLoader({
  watch: ['../../blog/**/*.md', '../../columns/**/*.md'],
  load: () => createContentIndex(contentRoot),
});
