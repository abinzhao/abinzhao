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
  { id: 'production', title: '性能运维与完整验收', from: 71, to: 72 },
];

export function groupHarnessChapters<T extends { seriesOrder?: number }>(articles: T[]) {
  return units.map((unit) => ({
    ...unit,
    articles: articles.filter((article) =>
      article.seriesOrder !== undefined && article.seriesOrder >= unit.from && article.seriesOrder <= unit.to),
  })).filter((unit) => unit.articles.length);
}
