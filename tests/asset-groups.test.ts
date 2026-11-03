import { expect, test } from 'vitest';
import { collectOptionalAssets } from '../docs/.vitepress/data/asset-groups';

test('includes transitive optional imports but protects shared page dependencies', () => {
  const chunk = (moduleId: string, imports: string[] = [], css: string[] = []) => ({
    type: 'chunk' as const, moduleIds: [moduleId], imports, viteMetadata: { importedCss: new Set(css) },
  });
  const groups = collectOptionalAssets({
    'page.js': chunk('/theme/pages/HomePage.vue', ['vue.js']),
    'particles.js': chunk('/theme/labs/particles/renderer.ts', ['geometry.js', 'vue.js'], ['lab.css']),
    'geometry.js': chunk('/node_modules/geometry/index.js', ['math.js']),
    'math.js': chunk('/node_modules/math/index.js'),
    'vue.js': chunk('/node_modules/vue/index.js'),
    'model.js': chunk('/node_modules/@mlc-ai/web-llm/index.js'),
  });
  expect([...groups.experiments].sort()).toEqual(['geometry.js', 'lab.css', 'math.js', 'particles.js']);
  expect([...groups.modelRuntime]).toEqual(['model.js']);
});
