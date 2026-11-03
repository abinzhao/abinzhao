export interface WorkEntry { id: string; date: string; title: string; description: string; href: string; source: string; tags: string[] }
export function validateTimeline(entries: WorkEntry[]): void {
  if (!Array.isArray(entries)) throw new Error('作品时间线必须是数组');
  const ids = new Set<string>();
  let previous = '';
  for (const entry of entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)) throw new Error('作品锚点无效或重复');
    ids.add(entry.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) ||
      new Date(entry.date).toISOString().slice(0, 10) !== entry.date || entry.date < previous) throw new Error('作品日期无效或未按时间排序');
    previous = entry.date;
    if (!entry.title?.trim() || !entry.description?.trim() || !entry.href?.startsWith('/') || !Array.isArray(entry.tags)) throw new Error('作品内容不完整');
    if (!/^https:\/\/github\.com\/abinzhao\/abinzhao\/commit\/[a-f0-9]{40}$/.test(entry.source)) throw new Error('作品必须提供可核查的提交来源');
  }
}
