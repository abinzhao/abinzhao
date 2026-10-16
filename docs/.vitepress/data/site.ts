import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateConfig } from './config-validation';

export interface SiteConfig {
  description: string;
  githubUrl: string;
  title: string;
}

const configPath = fileURLToPath(new URL('../../content/config/site.yml', import.meta.url));

export function loadSiteConfig(): SiteConfig {
  const parsed = parse(readFileSync(configPath, 'utf8'));
  validateConfig(parsed, { site: { title: 'string', description: 'string', githubUrl: 'string' } }, configPath);

  return parsed.site as SiteConfig;
}
