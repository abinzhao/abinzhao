import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { siteConfig } from '../site.config';

interface GithubApiRepository {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  updated_at: string;
  archived: boolean;
}

const endpoint = new URL(
  `/users/${siteConfig.github.username}/repos`,
  'https://api.github.com',
);
endpoint.searchParams.set('per_page', '100');
endpoint.searchParams.set('sort', 'updated');

const headers: HeadersInit = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'jianbin-zhao-personal-site',
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const response = await fetch(endpoint, { headers });

if (!response.ok) {
  throw new Error(
    `GitHub sync failed: ${response.status} ${response.statusText}`,
  );
}

const repositories = (await response.json()) as GithubApiRepository[];
const selected = new Set(siteConfig.github.featuredRepositories);
const normalized = repositories
  .filter((repository) => selected.has(repository.name))
  .map((repository) => ({
    name: repository.name,
    description: repository.description ?? '',
    htmlUrl: repository.html_url,
    homepage: repository.homepage ?? '',
    language: repository.language ?? '',
    topics: repository.topics ?? [],
    stars: repository.stargazers_count,
    updatedAt: repository.updated_at,
    archived: repository.archived,
  }));

const outputPath = resolve(
  'docs/.vitepress/data/generated/github-projects.json',
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

console.log(`Synced ${normalized.length} GitHub projects to ${outputPath}`);
