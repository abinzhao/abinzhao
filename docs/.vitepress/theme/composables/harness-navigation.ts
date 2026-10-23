const units = [
  { id: 'foundation-project', title: '基础项目与运行闭环', from: 1, to: 12 },
  { id: 'agent-models', title: 'Agent、模型与指令', from: 13, to: 18 },
  { id: 'skills-plugins', title: 'Skills、插件与扩展', from: 19, to: 24 },
  { id: 'mcp', title: 'MCP 协议与集成', from: 25, to: 30 },
  { id: 'context', title: '上下文、检索与记忆', from: 31, to: 36 },
  { id: 'sessions', title: '会话、持久化与恢复', from: 37, to: 42 },
  { id: 'tools', title: '工具、Shell 与计算机操作', from: 43, to: 48 },
  { id: 'security', title: '沙箱、权限与安全', from: 49, to: 54 },
  { id: 'orchestration', title: '多 Agent 与长任务', from: 55, to: 60 },
  { id: 'sdks', title: '产品 SDK 与客户端', from: 61, to: 66 },
  { id: 'evaluation', title: '测试、评测与可观测性', from: 67, to: 70 },
  { id: 'production', title: '性能运维与完整验收', from: 71, to: Number.MAX_SAFE_INTEGER },
];

export function groupHarnessChapters<T extends { seriesOrder?: number }>(articles: T[]) {
  return units.map((unit) => ({
    ...unit,
    to: unit.id === 'production'
      ? Math.max(72, ...articles.map((article) => article.seriesOrder ?? 0))
      : unit.to,
    articles: articles.filter((article) =>
      article.seriesOrder !== undefined && article.seriesOrder >= unit.from && article.seriesOrder <= unit.to),
  })).filter((unit) => unit.articles.length);
}

export function groupCourseChapters<T extends { seriesOrder?: number }>(slug: string, articles: T[]) {
  if (slug === 'agent-harness') return groupHarnessChapters(articles);
  if (slug !== 'fullstack-development') return [];
  const last = Math.max(37, ...articles.map((article) => article.seriesOrder ?? 0));
  return [
    { id: 'web-foundations', title: '网页基础与第一个项目', from: 1, to: 20 },
    { id: 'frontend-engineering', title: 'JavaScript、TypeScript 与 React 工程', from: 21, to: 37 },
    { id: 'backend-engineering', title: '后端、数据与全栈交付', from: 38, to: last },
  ].map((unit) => ({
    ...unit,
    articles: articles.filter((article) => article.seriesOrder !== undefined &&
      article.seriesOrder >= unit.from && article.seriesOrder <= unit.to),
  })).filter((unit) => unit.articles.length);
}
