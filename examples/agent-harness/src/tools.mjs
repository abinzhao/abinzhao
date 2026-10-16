import { readdir, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';

const extensions = new Set(['.md', '.txt', '.js', '.mjs', '.ts', '.tsx', '.vue', '.css', '.html']);
const definition = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

export function createTools(workspace) {
  const requestedRoot = resolve(workspace);
  const definitions = [
    definition('list_files', 'List readable text files in the workspace root.', {}),
    definition('read_file', 'Read one text source file, at most 16 KiB.', { path: { type: 'string', maxLength: 240 } }, ['path']),
  ];
  return {
    definitions,
    async execute(name, args, { signal } = {}) {
      signal?.throwIfAborted();
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
      // Start filesystem work only inside the awaited operation that owns its failure.
      const root = await realpath(requestedRoot);
      if (name === 'list_files') {
        if (Object.keys(args).length) throw new Error('Unexpected list_files arguments');
        const entries = await readdir(root, { withFileTypes: true });
        return JSON.stringify(entries.filter((entry) =>
          entry.isFile() && !entry.name.startsWith('.') && extensions.has(extname(entry.name)),
        ).map((entry) => entry.name).sort().slice(0, 100));
      }
      if (name !== 'read_file') throw new Error(`Unknown tool: ${name}`);
      if (Object.keys(args).some((key) => key !== 'path') || typeof args.path !== 'string'
        || !args.path || args.path.length > 240 || isAbsolute(args.path)
        || args.path.split(/[\\/]/).some((part) => part === '..' || part.startsWith('.'))
        || !extensions.has(extname(args.path))) throw new Error('Invalid readable path');
      const file = await realpath(resolve(root, args.path));
      const rel = relative(root, file);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path leaves workspace');
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 16_384) throw new Error('File exceeds readable limit');
        // Bounded read also holds when a file grows after stat.
        const bytes = Buffer.alloc(16_385);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        signal?.throwIfAborted();
        if (bytesRead > 16_384) throw new Error('File exceeds readable limit');
        return bytes.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
    },
  };
}
