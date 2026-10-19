import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { parse } from 'yaml';
import { validateConfig } from './config-validation';

export interface HomeData {
  actions: {
    primary: { label: string; link: string };
    secondary: { label: string; link: string };
  };
  profile: {
    avatar: string;
    description: string;
    handle: string;
    intro: string;
    location: string;
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
  load: () => {
    const parsed = parse(readFileSync(configPath, 'utf8'));
    validateConfig(parsed, {
      actions: { primary: { label: 'string', link: 'string' }, secondary: { label: 'string', link: 'string' } },
      profile: { avatar: 'string', description: 'string', handle: 'string', intro: 'string', location: 'string', name: 'string', role: 'string', status: 'string' },
      terminal: { footer: 'string', label: 'string', lines: ['text'] },
    }, configPath);
    return parsed as HomeData;
  },
});
