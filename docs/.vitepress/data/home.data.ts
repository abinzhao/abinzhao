import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { parse } from 'yaml';

export interface HomeData {
  actions: {
    primary: { label: string; link: string };
    secondary: { label: string; link: string };
  };
  modules: Array<{
    description: string;
    icon: 'book' | 'fingerprint' | 'graduation' | 'rocket';
    link: string;
    meta: string;
    title: string;
  }>;
  profile: {
    avatar: string;
    description: string;
    handle: string;
    intro: string;
    location: string;
    metrics: Array<{ label: string; value: string }>;
    name: string;
    role: string;
    status: string;
  };
  terminal: {
    footer: string;
    label: string;
    lines: string[];
  };
}

declare const data: HomeData;
export { data };

const configPath = fileURLToPath(new URL('../../content/config/home.yml', import.meta.url));

export default defineLoader({
  watch: ['../../content/config/home.yml'],
  load: () => parse(readFileSync(configPath, 'utf8')) as HomeData,
});
