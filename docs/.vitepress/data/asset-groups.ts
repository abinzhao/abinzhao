interface OutputChunk {
  type: string;
  moduleIds?: readonly string[];
  imports?: readonly string[];
  isEntry?: boolean;
  viteMetadata?: { importedCss?: Set<string>; importedAssets?: Set<string> };
}

/** 从构建图追踪静态依赖，避免可选图形库拆 chunk 后混进默认离线包。 */
export function collectOptionalAssets(bundle: Record<string, OutputChunk>) {
  const groups = { modelRuntime: new Set<string>(), experiments: new Set<string>(), knowledge: new Set<string>() };
  const required = new Set<string>();
  function closure(file: string, set: Set<string>) {
    if (set.has(file)) return;
    set.add(file);
    const chunk = bundle[file];
    for (const dependency of chunk?.imports ?? []) closure(dependency, set);
    for (const css of chunk?.viteMetadata?.importedCss ?? []) set.add(css);
    for (const asset of chunk?.viteMetadata?.importedAssets ?? []) set.add(asset);
  }
  for (const [file, output] of Object.entries(bundle)) {
    if (output.type !== 'chunk') continue;
    if (output.isEntry || output.moduleIds?.some((id) => /\/theme\/pages\/|\.md(?:\?|$)/.test(id))) closure(file, required);
  }
  for (const [file, output] of Object.entries(bundle)) {
    if (output.type !== 'chunk') continue;
    const modules = output.moduleIds ?? [];
    if (modules.some((id) => id.includes('/@mlc-ai/web-llm/'))) closure(file, groups.modelRuntime);
    if (modules.some((id) => /\/theme\/labs\/|\/examples\/site-labs\//.test(id))) closure(file, groups.experiments);
    if (modules.some((id) => /\/knowledge-(?:index|corpus)\.data/.test(id))) closure(file, groups.knowledge);
  }
  for (const set of Object.values(groups)) for (const file of required) set.delete(file);
  return groups;
}
