import type { Metadata } from "next";
import Link from "next/link";
import path from "node:path";
import { ContentEmptyState } from "@/components/ContentEmptyState";
import { parseProjectSource, readContentDirectory } from "@/lib/content";

export const metadata: Metadata = {
  title: "项目",
  description: "赵建斌公开的项目案例、职责、方案取舍与验证结果。",
};

export default function WorkPage() {
  const projects = readContentDirectory(
    path.join(process.cwd(), "content/projects"),
    parseProjectSource,
  );

  return (
    <main className="page-shell">
      <header className="page-intro">
        <p className="page-kicker">WORK / CASES</p>
        <h1 className="page-title">项目与案例</h1>
        <p className="page-description">
          这里关注问题、约束、个人职责、方案取舍和验证结果，而不只展示最终界面。
        </p>
      </header>
      {projects.length > 0 ? (
        <div className="page-content content-list">
          {projects.map(({ meta }) => (
            <Link key={meta.slug} href={`/work/${meta.slug}`}>
              <span>{meta.domains.join(" / ")}</span>
              <h2>{meta.title}</h2>
              <p>{meta.summary}</p>
            </Link>
          ))}
        </div>
      ) : (
        <ContentEmptyState
          title="项目资料准备中"
          description="公开案例正在进行信息核对。没有真实材料的项目不会以示例内容替代。"
          actionHref="/about"
          actionLabel="了解能力与原则"
        />
      )}
    </main>
  );
}
