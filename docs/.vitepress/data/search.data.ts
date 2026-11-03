import { defineLoader } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { createContentIndex } from './content';

export interface SearchEntry { href: string; title: string; description: string; tags: string[]; section: string }
declare const data: SearchEntry[];
export { data };
export default defineLoader({
  watch: ['../../blog/**/*.md', '../../columns/**/*.md'],
  async load(): Promise<SearchEntry[]> {
    const content = await createContentIndex(fileURLToPath(new URL('../../', import.meta.url)));
    return [
      ...content.blogArticles.map((item) => ({ ...item, section: '博客' })),
      ...content.columns.flatMap((column) => [
        { ...column, tags: [], section: '专题' },
        ...column.articles.map((item) => ({ ...item, section: column.title })),
      ]),
    ].map(({ href, title, description, tags, section }) => ({ href, title, description: description ?? '', tags, section }));
  },
});
