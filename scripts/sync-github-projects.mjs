import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 构建读取已核验快照，更新失败不覆盖旧数据，也不要求访客访问 GitHub API。
const account = 'abinzhao';
const input = process.argv.find((arg) => arg.startsWith('--input='))?.slice(8);
let repositories = [];
if (input) {
  repositories = JSON.parse(await readFile(input, 'utf8'));
} else {
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/users/${account}/repos?type=owner&sort=updated&per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'abinzhao-public-projects' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub: ${response.status}; 保留现有项目快照`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('GitHub 响应必须为仓库数组');
    repositories.push(...batch);
    if (batch.length < 100) break;
  }
}
if (!Array.isArray(repositories) || !repositories.length) throw new Error('拒绝发布空仓库快照');
const projects = repositories.map((repo) => {
  if (repo.private !== false || repo.owner?.login !== account || typeof repo.name !== 'string' ||
      repo.html_url !== `https://github.com/${account}/${repo.name}`) {
    throw new Error('仓库来源或公开状态不符');
  }
  return {
    name: repo.name, url: repo.html_url, description: repo.description ?? '',
    language: repo.language, topics: repo.topics ?? [], stars: repo.stargazers_count,
    fork: repo.fork, archived: repo.archived, updatedAt: repo.updated_at,
  };
}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const directory = fileURLToPath(new URL('../docs/content/github/', import.meta.url));
await mkdir(directory, { recursive: true });
const target = `${directory}repos.json`;
await writeFile(`${target}.tmp`, JSON.stringify({
  account, checkedAt: new Date().toISOString().slice(0, 10),
  source: `https://api.github.com/users/${account}/repos`,
  projects,
}, null, 2) + '\n');
await rename(`${target}.tmp`, target);
console.log(`已核验 ${projects.length} 个公开仓库 → docs/content/github/repos.json`);
