import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// ZIP STORE uses only Node built-ins so the downloadable example needs no archiver dependency.
const root = fileURLToPath(new URL('../examples/agent-harness/', import.meta.url));
const output = fileURLToPath(new URL('../docs/public/downloads/', import.meta.url));
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
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (entry.name === 'node_modules') continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), `${name}/`));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}
const local = [];
const central = [];
let offset = 0;
for (const file of await files(root)) {
  const data = await readFile(join(root, file));
  const name = Buffer.from(`agent-harness/${file}`);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(((2026 - 1980) << 9) | (10 << 5) | 17, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  header.copy(record, 6, 4, 30);
  record.writeUInt32LE(offset, 42);
  central.push(record, name);
  local.push(header, name, data);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(central.length / 2, 8);
end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'agent-harness.zip'), Buffer.concat([...local, directory, end]));
console.log(`Harness 源码包：${central.length / 2} 个文件`);
