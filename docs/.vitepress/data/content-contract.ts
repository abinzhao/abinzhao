import { realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { experiments } from './labs';

export interface ContentMetadata {
  id: string;
  readingTime: number;
  updatedAt?: string;
  verifiedAt?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  demoIds?: string[];
  source?: { path: string; ref?: string; command?: string };
  runtime?: string;
  verification?: { kind: 'documentation' | 'unit' | 'browser' | 'device'; evidence: string };
  locale?: string;
  translationOf?: string;
}

export function validContentDate(value: unknown): string | undefined {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : undefined;
}

export function parseContentMetadata(data: Record<string, unknown>, href: string, body: string, date: string): ContentMetadata {
  const fail = (key: string, message: string): never => { throw new Error(`${href}: ${key} ${message}`); };
  const text = (key: string): string | undefined => {
    if (data[key] === undefined) return;
    return typeof data[key] === 'string' && data[key].trim() ? data[key].trim() : fail(key, '必须是非空字符串');
  };
  const id = text('id') ?? href.replace(/\.md$/, '.html');
  if (id.length > 200 || /[\s?#\\]/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id)) fail('id', '无效');
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '');
  const words = (prose.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) ?? []).length;
  const codeLines = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].reduce((sum, match) => sum + match[1].trim().split('\n').length, 0);
  const metadata: ContentMetadata = { id, readingTime: Math.max(1, Math.ceil(words / 400 + codeLines / 20)) };
  for (const key of ['updatedAt', 'verifiedAt'] as const) {
    if (data[key] === undefined) continue;
    const value = validContentDate(data[key]);
    if (!value || value < date) fail(key, '必须是有效日期且不早于发布日期');
    metadata[key] = value;
  }
  if (data.level !== undefined) {
    if (!['beginner', 'intermediate', 'advanced'].includes(String(data.level))) fail('level', '必须是 beginner / intermediate / advanced');
    metadata.level = data.level as ContentMetadata['level'];
  }
  for (const key of ['prerequisites', 'demoIds'] as const) {
    if (data[key] === undefined) continue;
    const value = data[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) fail(key, '必须是非空字符串数组');
    metadata[key] = [...new Set((value as string[]).map((item) => item.trim()))];
  }
  const knownDemos = new Set<string>(experiments.map((demo) => demo.id));
  if (metadata.demoIds?.some((id) => !knownDemos.has(id))) fail('demoIds', '引用了不存在或未发布的实验');
  if (metadata.demoIds?.length && !data.id) fail('id', '关联实验的新内容必须填写稳定 id');
  if (data.source !== undefined) {
    const source = data.source as Record<string, unknown> | null;
    if (!source || typeof source !== 'object' || Array.isArray(source) || typeof source.path !== 'string' ||
      !/^(examples|docs\/\.vitepress)\//.test(source.path) || /(^|\/)\.\.(\/|$)|[\\?#]/.test(source.path)) fail('source.path', '必须指向仓库内的示例或受维护实现');
    if (source!.ref !== undefined && source!.ref !== 'working-tree' && !/^[a-f0-9]{40}$/.test(String(source!.ref))) fail('source.ref', '使用完整提交 SHA，本地未发布版本使用 working-tree');
    if (source!.command !== undefined && (typeof source!.command !== 'string' || !source!.command.trim())) fail('source.command', '必须是非空字符串');
    metadata.source = source as ContentMetadata['source'];
  }
  if (data.verification !== undefined) {
    const value = data.verification as Record<string, unknown> | null;
    if (!value || !['documentation', 'unit', 'browser', 'device'].includes(String(value.kind)) ||
      typeof value.evidence !== 'string' || !value.evidence.trim()) fail('verification', '需要验证类型与具体证据');
    metadata.verification = value as ContentMetadata['verification'];
  }
  for (const key of ['runtime', 'locale', 'translationOf'] as const) {
    const value = text(key);
    if (value) metadata[key] = value;
  }
  return metadata;
}

/** 发布边界在全集组装后验证，草稿既不能成为先修节点也不能泄露到图谱。 */
export async function validateContentRelations(articles: Array<ContentMetadata & { href: string }>, contentRoot: string) {
  const byId = new Map<string, typeof articles[number]>();
  for (const article of articles) {
    if (byId.has(article.id)) throw new Error(`${article.href}: id 重复 ${article.id}`);
    byId.set(article.id, article);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`${id}: 先修关系存在环`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)!.prerequisites ?? []) {
      if (!byId.has(prerequisite)) throw new Error(`${id}: 先修 ${prerequisite} 不存在或未发布`);
      visit(prerequisite);
    }
    visiting.delete(id);
    visited.add(id);
  }
  const root = await realpath(resolve(contentRoot, '..'));
  for (const article of articles) {
    visit(article.id);
    if (article.translationOf && !byId.has(article.translationOf)) throw new Error(`${article.id}: translationOf 不存在`);
    if (!article.source) continue;
    const path = await realpath(resolve(root, article.source.path)).catch(() => '');
    if (!path.startsWith(`${root}${sep}`) || !await stat(path).then((value) => value.isFile() || value.isDirectory()).catch(() => false)) {
      throw new Error(`${article.href}: source.path 不存在或越出仓库`);
    }
  }
}
