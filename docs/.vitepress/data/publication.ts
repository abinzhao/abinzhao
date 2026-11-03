import type { Article } from './content';
import { validContentDate } from './content-contract';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);

/** 订阅仅消费已通过发布校验的文章；更新时间不改变条目身份。 */
export function createFeed(articles: Article[], title: string, description: string, siteUrl: string) {
  const items = [...articles].sort((a, b) => (b.updatedAt ?? b.date).localeCompare(a.updatedAt ?? a.date) || a.id.localeCompare(b.id));
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${escapeXml(title)}</title><link>${escapeXml(siteUrl)}</link><description>${escapeXml(description)}</description>
<language>zh-CN</language><atom:link href="${escapeXml(siteUrl)}feed.xml" rel="self" type="application/rss+xml"/>
${items.map((article) => {
    const url = new URL(article.href.slice(1), siteUrl).href;
    return `<item><title>${escapeXml(article.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="false">${escapeXml(article.id)}</guid><description>${escapeXml(article.description ?? '')}</description><pubDate>${new Date(`${article.date}T00:00:00Z`).toUTCString()}</pubDate></item>`;
  }).join('\n')}
</channel></rss>\n`;
}

export function articleStructuredData(frontmatter: Record<string, unknown>, title: string, description: string, url: string, siteUrl: string) {
  const published = validContentDate(frontmatter.date);
  if (!published) return [];
  const isCourse = url.includes('/columns/');
  return [
    {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: title, description, mainEntityOfPage: url, url,
      datePublished: published, dateModified: validContentDate(frontmatter.updatedAt) ?? published,
      inLanguage: 'zh-CN', author: { '@type': 'Person', name: '阿斌', url: 'https://github.com/abinzhao' },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '阿斌实验室', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: isCourse ? '专题教程' : '博客', item: `${siteUrl}${isCourse ? 'columns' : 'blog'}/` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    },
  ];
}
