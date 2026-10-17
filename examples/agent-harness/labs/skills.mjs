import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute } from 'node:path';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parse(text) {
  // 教学子集只接受单行 name/description；不是通用 YAML 或完整 Agent Skills 校验器。
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Skill metadata is missing');
  const fields = Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error('Only single-line skill metadata is supported');
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    return [line.slice(0, separator).trim(), value];
  }));
  if (!namePattern.test(fields.name ?? '') || !fields.description) {
    throw new Error('Invalid skill name or description');
  }
  return { name: fields.name, description: fields.description, body: match[2].trim() };
}

async function readContained(root, file) {
  if ((await lstat(file)).isSymbolicLink()) throw new Error('Skill symlink is rejected');
  const actual = await realpath(file);
  const path = relative(root, actual);
  if (path.startsWith('..') || isAbsolute(path)) throw new Error('Skill escapes its source root');
  const stats = await lstat(actual);
  if (!stats.isFile() || stats.size > 65_536) throw new Error('Skill file must be at most 64 KiB');
  return readFile(actual, 'utf8');
}

export async function discoverSkills(roots) {
  const catalog = [];
  const sources = new Set();
  for (const entry of roots) {
    if (!namePattern.test(entry.source) || sources.has(entry.source)) {
      throw new Error('Skill source must be unique');
    }
    sources.add(entry.source);
    const root = await realpath(entry.path);
    for (const folder of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (folder.isSymbolicLink()) throw new Error('Skill directory symlink is rejected');
      if (!folder.isDirectory()) continue;
      const file = join(root, folder.name, 'SKILL.md');
      const text = await readContained(root, file);
      const skill = parse(text);
      if (skill.name !== folder.name) throw new Error('Skill name must match its directory');
      catalog.push({
        source: entry.source, name: skill.name, description: skill.description,
        id: `${entry.source}/${skill.name}`, root, file, digest: digest(text),
      });
    }
  }
  return catalog;
}

export async function loadSkill(catalog, id) {
  const matches = catalog.filter((entry) => entry.id === id || entry.name === id);
  if (!matches.length) throw new Error('Unknown skill');
  if (matches.length > 1) throw new Error('Skill name is ambiguous; qualify its source');
  const entry = matches[0];
  const text = await readContained(entry.root, entry.file);
  if (digest(text) !== entry.digest) throw new Error('Skill changed since discovery; rediscover it');
  return { id: entry.id, source: entry.source, ...parse(text) };
}
