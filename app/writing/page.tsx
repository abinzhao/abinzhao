import type { Metadata } from "next";
import path from "node:path";
import { ContentEmptyState } from "@/components/ContentEmptyState";
import { WritingCollection } from "@/components/WritingCollection";
import { parseArticleSource, readContentDirectory } from "@/lib/content";

export const metadata: Metadata = {
  title: "文章",
  description: "赵建斌关于前端、HarmonyOS 和跨端应用实践的公开文章。",
};

export default function WritingPage() {
  const articles = readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );

  return (
    <main className="page-shell">
      <header className="page-intro">
        <p className="page-kicker">WRITING / NOTES</p>
        <h1 className="page-title">文章与思考</h1>
        <p className="page-description">
          记录技术判断、实现细节与复盘，尽量让每篇内容都能回到具体问题。
        </p>
        <a className="text-link" href="/rss.xml">
          订阅 RSS
        </a>
      </header>
      {articles.length > 0 ? (
        <WritingCollection articles={articles.map(({ meta }) => meta)} />
      ) : (
        <ContentEmptyState
          title="文章正在整理"
          description="真实内容发布后会自动进入文章列表和 RSS，不发布草稿或示例文章。"
        />
      )}
    </main>
  );
}
