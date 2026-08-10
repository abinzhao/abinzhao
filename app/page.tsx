import Link from "next/link";
import path from "node:path";
import { AbilityMap } from "@/components/AbilityMap";
import { ContentEmptyState } from "@/components/ContentEmptyState";
import { SectionHeading } from "@/components/SectionHeading";
import {
  parseArticleSource,
  parseProjectSource,
  readContentDirectory,
} from "@/lib/content";
import { profile } from "@/lib/profile";

const audiences = [
  {
    name: "技术同行",
    description: "阅读技术文章与实践复盘，了解具体判断和实现边界。",
    href: "/writing",
    action: "进入文章",
  },
  {
    name: "招聘与管理者",
    description: "从项目职责、方案取舍与验证方式了解专业能力。",
    href: "/work",
    action: "查看项目",
  },
  {
    name: "潜在合作方",
    description: "了解能力边界、工作原则与可用的联系入口。",
    href: "/contact",
    action: "联系沟通",
  },
] as const;

export default function HomePage() {
  const projects = readContentDirectory(
    path.join(process.cwd(), "content/projects"),
    parseProjectSource,
  ).filter(({ meta }) => meta.featured);
  const articles = readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );

  return (
    <main>
      <section className="hero section-shell">
        <div className="hero-copy">
          <p className="identity">{profile.name}</p>
          <h1 aria-label={profile.headline}>
            <span aria-hidden="true">构建跨端</span>
            <span aria-hidden="true">数字体验。</span>
          </h1>
          <p className="role-line">{profile.roles.join(" / ")}</p>
          <p className="hero-summary">
            面向前端、HarmonyOS 与多端应用场景，关注从问题定义到稳定交付的完整过程。
          </p>
          <div className="hero-actions">
            <Link className="button primary-button" href="/work">
              查看项目
            </Link>
            <Link className="button secondary-button" href="/about">
              了解我
            </Link>
          </div>
        </div>
        <AbilityMap />
      </section>

      <section className="section-shell audience-section">
        <SectionHeading
          index="01"
          title="从你的问题开始"
          description="不同访问目的，进入不同内容路径。"
        />
        <div className="audience-list">
          {audiences.map((audience, index) => (
            <Link key={audience.name} className="audience-item" href={audience.href}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{audience.name}</h3>
                <p>{audience.description}</p>
              </div>
              <strong>{audience.action} ↗</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-shell content-section">
        <SectionHeading
          index="02"
          title="代表项目"
          description="项目只展示可公开、可追溯的职责、取舍与结果。"
        />
        {projects.length > 0 ? (
          <div className="content-list">
            {projects.map(({ meta }) => (
              <Link key={meta.slug} href={`/work/${meta.slug}`}>
                <span>{meta.domains.join(" / ")}</span>
                <h3>{meta.title}</h3>
                <p>{meta.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <ContentEmptyState
            title="项目资料准备中"
            description="真实案例完成公开边界核对后会出现在这里，不使用示例项目填充。"
            actionHref="/about"
            actionLabel="先了解工作原则"
          />
        )}
      </section>

      <section className="section-shell content-section">
        <SectionHeading
          index="03"
          title="文章与实践"
          description="记录技术决策、实现过程和可以迁移的方法。"
        />
        {articles.length > 0 ? (
          <div className="editorial-list">
            {articles.slice(0, 3).map(({ meta }) => (
              <Link key={meta.slug} href={`/writing/${meta.slug}`}>
                <time dateTime={meta.publishedAt}>{meta.publishedAt}</time>
                <h3>{meta.title}</h3>
                <p>{meta.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <ContentEmptyState
            title="文章正在整理"
            description="首篇内容发布后，这里将按时间展示公开文章与专题入口。"
            actionHref="/writing"
            actionLabel="查看文章页"
          />
        )}
      </section>

      <section className="section-shell closing-section">
        <p>从真实问题出发，让每次交付都能够解释、验证和复用。</p>
        <Link className="button primary-button" href="/contact">
          建立联系
        </Link>
      </section>
    </main>
  );
}
