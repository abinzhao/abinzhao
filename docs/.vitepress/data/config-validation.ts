type Shape = string | { [key: string]: Shape } | Shape[];

export function validateConfig(value: unknown, shape: Shape, source: string, path = ''): void {
  const fail = () => { throw new Error(`${source}: ${path || 'root'} 字段缺失或类型无效`); };
  if (typeof shape === 'string') {
    const valid = shape.split('|').some((kind) => kind === 'string' ? typeof value === 'string' && Boolean(value.trim()) :
      kind === 'text' ? typeof value === 'string' :
      kind === 'number' ? typeof value === 'number' && Number.isFinite(value) :
      kind === 'boolean' ? typeof value === 'boolean' : value === kind);
    if (!valid) fail();
  } else if (Array.isArray(shape)) {
    if (shape.length > 1) { if (!shape.includes(value as Shape)) fail(); return; }
    if (!Array.isArray(value)) fail();
    (value as unknown[]).forEach((item, index) => validateConfig(item, shape[0], source, `${path}.${index}`));
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    for (const [key, child] of Object.entries(shape)) validateConfig((value as Record<string, unknown>)[key], child, source, path ? `${path}.${key}` : key);
  }
}
