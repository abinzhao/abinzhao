import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';

export interface PublicProject {
  name: string;
  url: string;
  description: string;
  language: string | null;
  topics: string[];
  stars: number;
  fork: boolean;
  archived: boolean;
  updatedAt: string;
}
export interface ProjectsData {
  account: string;
  checkedAt: string;
  source: string;
  projects: PublicProject[];
}
declare const data: ProjectsData;
export { data };
const path = fileURLToPath(new URL('../../content/github/repos.json', import.meta.url));
export default defineLoader({
  watch: ['../../content/github/repos.json'],
  load: () => JSON.parse(readFileSync(path, 'utf8')) as ProjectsData,
});
