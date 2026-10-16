import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { parse } from 'yaml';
import { validateConfig } from './config-validation';

export interface AboutData {
  actions: Array<{
    kind: 'github' | 'project';
    label: string;
    link: string;
  }>;
  identity: {
    avatar: string;
    bio: string;
    handle: string;
    location: string;
    name: string;
    role: string;
    status: string;
  };
  principles: Array<{
    description: string;
    index: string;
    subtitle: string;
    tags: string[];
    title: string;
  }>;
  skills: Array<{
    group: string;
    items: Array<{
      detail: string;
      name: string;
      value: number;
    }>;
    label: string;
  }>;
  stats: Array<{
    detail: string;
    label: string;
    value: number | string;
  }>;
}

declare const data: AboutData;
export { data };

const configPath = fileURLToPath(new URL('../../content/config/about.yml', import.meta.url));

export default defineLoader({
  watch: ['../../content/config/about.yml'],
  load: () => {
    const parsed = parse(readFileSync(configPath, 'utf8'));
    validateConfig(parsed, {
      identity: { avatar: 'string', bio: 'string', handle: 'string', location: 'string', name: 'string', role: 'string', status: 'string' },
      actions: [{ kind: 'github|project', label: 'string', link: 'string' }],
      stats: [{ detail: 'string', label: 'string', value: 'string|number' }],
      principles: [{ description: 'string', index: 'string', subtitle: 'string', tags: ['string'], title: 'string' }],
      skills: [{ group: 'string', label: 'string', items: [{ detail: 'string', name: 'string', value: 'number' }] }],
    }, configPath);
    return parsed as AboutData;
  },
});
