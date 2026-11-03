import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import matter from 'gray-matter';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] ?? join(root, 'docs/public/downloads');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** 白名单打包可重建站点所需源码；生成目录、隐藏文件和草稿不进入公开下载包。 */
async function collect(directory, prefix) {
  const index = await readFile(join(directory, 'index.md'), 'utf8').catch(() => '');
  if (index && matter(index).data.draft === true) return [];
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if ((entry.name.startsWith('.') && !['.vitepress', '.gitignore'].includes(entry.name)) ||
      ['node_modules', 'dist', 'cache', 'downloads', 'coverage'].includes(entry.name)) continue;
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await collect(join(directory, entry.name), path));
    else if (entry.isFile() && (entry.name === '.gitignore' ||
      /\.(md|html|mjs|cjs|mts|tsx|ts|js|vue|css|json|ya?ml|sql|wxml|wxss|wgsl|frag|svg|png|webp|jpe?g|txt|tscn|tres|gd|uid|godot)$/.test(entry.name))) {
      const bytes = await readFile(join(directory, entry.name));
      if (entry.name.endsWith('.md') && matter(bytes.toString()).data.draft === true) continue;
      result.push({ path, bytes });
    }
  }
  return result;
}
const entries = [];
for (const directory of ['docs', 'examples', 'scripts', 'tests', '.github/workflows']) entries.push(...await collect(join(root, directory), directory));
for (const path of ['package.json', 'pnpm-lock.yaml', 'playwright.config.ts', 'playwright.production.config.ts', 'README.md', '.gitignore']) {
  entries.push({ path, bytes: await readFile(join(root, path)) });
}
entries.sort((a, b) => a.path.localeCompare(b.path));
const files = entries.map(({ path, bytes }) => ({ path, sha256: sha256(bytes) }));
const manifest = {
  version: 1,
  ref: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : 'working-tree',
  digest: sha256(Buffer.from(JSON.stringify(files))),
  files,
};
entries.push({ path: 'SOURCE-MANIFEST.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') });

/** 延用 Harness 的 ZIP 格式，使用 Node 自带 DEFLATE，避免新增归档依赖。 */
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [], central = [];
let offset = 0;
for (const { path, bytes } of entries) {
  const data = deflateRawSync(bytes);
  const name = Buffer.from(`abinzhao/${path}`);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(((2026 - 1980) << 9) | (11 << 5) | 3, 12);
  header.writeUInt32LE(crc32(bytes), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  header.copy(record, 6, 4, 30);
  record.writeUInt32LE(offset, 42);
  central.push(record, name); local.push(header, name, data);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await mkdir(output, { recursive: true });
const zip = Buffer.concat([...local, directory, end]);
await writeFile(join(output, 'site-labs.zip'), zip);
await writeFile(join(output, 'site-labs-manifest.json'), JSON.stringify({ ...manifest, archiveSha256: sha256(zip), bytes: zip.length }, null, 2) + '\n');
console.log(`站点源码包：${entries.length} 个文件，${zip.length} 字节，内容 SHA256 ${manifest.digest}`);
