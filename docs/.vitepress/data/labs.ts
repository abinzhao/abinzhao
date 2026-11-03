/** 轻量实验目录。这里不导入 renderer、worker、shader 或教程正文。 */
export const experiments = [
  { id: 'particles', effect: 'E01', title: '代码粒子场', category: 'GPU', description: '同一组粒子在聚合、流动与回归之间演化。', technologies: ['WebGPU', 'Canvas2D'], level: 'advanced' },
  { id: 'code-morph', effect: 'E02', title: '代码演化时间轴', category: '交互', description: '逐步改进一段真实代码，观察 token 和预览同步变化。', technologies: ['WAAPI', '稳定标识'], level: 'advanced' },
  { id: 'rendering', effect: 'E03', title: '浏览器渲染管线', category: '原理', description: '拆开 DOM 到合成的路径，对比 width 与 transform。', technologies: ['Scroll Timeline', 'SVG'], level: 'intermediate' },
  { id: 'knowledge-graph', effect: 'E04', title: '教程知识图谱', category: '数据', description: '沿着真实课程与先修关系探索本站的学习内容。', technologies: ['Worker', 'Canvas2D'], level: 'advanced' },
  { id: 'layers', effect: 'E05', title: '站点空间剖面', category: '交互', description: '展开本站的界面、状态、计算和存储职责。', technologies: ['CSS 3D', 'Pointer Events'], level: 'advanced' },
  { id: 'page-transition', effect: 'E06', title: '共享元素导航', category: '交互', description: '让实验身份跨越页面，并保留普通导航的可靠性。', technologies: ['View Transitions', 'VitePress'], level: 'advanced' },
  { id: 'spectral', effect: 'E09', title: '光谱材质台', category: 'GPU', description: '拖动光源，探索折射、薄膜色散和金属高光的视觉近似。', technologies: ['WebGL2', 'GLSL'], level: 'advanced' },
  { id: 'project-layout', effect: 'E10', title: '可打断的空间重排', category: '交互', description: '在真实项目列表中切换顺序、密度与语言筛选。', technologies: ['FLIP', 'WAAPI'], level: 'advanced' },
  { id: 'execution', effect: 'E11', title: '执行轨迹显微镜', category: '原理', description: '给受控示例不同输入，核对每一步执行、变量与结果。', technologies: ['AbortController', '执行事件'], level: 'advanced' },
  { id: 'timeline', effect: 'E12', title: '可回溯作品时间线', category: '数据', description: '用可核查的作品记录连接时间、源码与教程。', technologies: ['SVG', 'ResizeObserver'], level: 'intermediate' },
] as const;
export type ExperimentId = typeof experiments[number]['id'];
export const experimentHref = (id: string) => `/labs/${id}.html`;
