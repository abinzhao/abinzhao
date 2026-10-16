import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export interface SiteConfig {
  description: string;
  githubUrl: string;
  title: string;
}

interface SiteConfigFile {
  site?: Partial<SiteConfig>;
}

const configPath = fileURLToPath(new URL('../../content/config/site.yml', import.meta.url));

export function loadSiteConfig(): SiteConfig {
  const parsed = parse(readFileSync(configPath, 'utf8')) as SiteConfigFile;

  return {
    description: parsed.site?.description ?? '',
    githubUrl: parsed.site?.githubUrl ?? '',
    title: parsed.site?.title ?? '阿斌实验室',
  };
}
