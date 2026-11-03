import { readFileSync } from 'node:fs';
import { defineLoader } from 'vitepress';
import { tokenizeSteps, type CodeToken } from './code-tokens';

export interface CodeStep { title: string; explanation: string; source: string; file: string; tokens: CodeToken[] }
declare const data: CodeStep[];
export { data };
export function loadCodeSteps(): CodeStep[] {
  const definitions = [
    { title: '改变几何尺寸', file: 'progress-width.css', explanation: 'width 改变盒子的布局宽度。移动进度滑块，后续 Layout / Paint 可能需要重新计算；此处没有虚构性能计数。' },
    { title: '只改变视觉比例', file: 'progress-transform.css', explanation: '宽度保持 100%，scaleX 改变绘制比例。盒子的布局尺寸不再跟随进度变化；是否独立合成仍由浏览器决定。' },
    { title: '隔离布局影响', file: 'progress-contained.css', explanation: '容器声明 layout paint containment，约束内部布局与绘制影响范围。它会改变格式化上下文并裁剪溢出，不应无条件用于任意布局。' },
  ];
  const sources = definitions.map(({ file }) => readFileSync(new URL(`../../../examples/site-labs/${file}`, import.meta.url), 'utf8'));
  const tokens = tokenizeSteps(sources);
  return definitions.map((definition, index) => ({ ...definition, source: sources[index], tokens: tokens[index] }));
}
export default defineLoader({ watch: ['../../../examples/site-labs/progress-*.css'], load: loadCodeSteps });
