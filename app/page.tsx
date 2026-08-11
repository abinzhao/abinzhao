import Link from "next/link";
import path from "node:path";
import { CelestialScene } from "@/components/CelestialScene";
import { ContentEmptyState } from "@/components/ContentEmptyState";
import { GlassCard } from "@/components/GlassCard";
import { RevealSection } from "@/components/RevealSection";
import { SectionHeading } from "@/components/SectionHeading";
import {
  parseArticleSource,
  parseProjectSource,
  readContentDirectory,
} from "@/lib/content";
import { profile } from "@/lib/profile";

const contentPaths = [
  {
    name: "文章入口",
    description: "阅读技术决策、实践复盘与可迁移的方法。",
    href: "/writing",
  },
  {
    name: "项目入口",
    description: "查看公开项目中的职责、方案取舍与验证方式。",
    href: "/work",
  },
  {
    name: "联系入口",
    description: "围绕明确的问题、边界与合作方式展开沟通。",
    href: "/contact",
  },
] as const;

function ImmersiveHero() {
  return (
    <section
      className="immersive-hero section-shell"
      aria-label="个人介绍"
    >
      <div className="immersive-hero__copy">
        <p className="identity">{profile.name}</p>
        <h1>{profile.headline}</h1>
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
      <div className="immersive-hero__scene">
        <CelestialScene />
      </div>
    </section>
  );
}

export default function HomePage() {
  const projects = readContentDirectory(
    path.join(process.cwd(), "content/projects"),
    parseProjectSource,
  ).filter(({ meta }) => meta.featured);
  const articles = readContentDirectory(
    path.join(process.cwd(), "content/articles"),
    parseArticleSource,
  );
  const featuredProjects = projects.slice(0, 2);
  const featuredArticle = articles.length > 1 ? articles[0] : null;

  return (
    <main>
      <ImmersiveHero />

      <RevealSection className="section-shell home-section featured-section">
        <SectionHeading
          index="01"
          title="精选内容"
          description="从真实公开项目开始，快速了解关注的问题与交付方式。"
        />
        <div className="featured-content">
          <div className="featured-grid">
            {featuredProjects.map(({ meta }) => (
              <GlassCard key={meta.slug} className="featured-card">
                <Link href={`/work/${meta.slug}`}>
                  <span>{meta.domains.join(" / ")}</span>
                  <h3>{meta.title}</h3>
                  <p>{meta.summary}</p>
                </Link>
              </GlassCard>
            ))}
            {featuredArticle ? (
              <GlassCard className="featured-card featured-card--article">
                <Link href={`/writing/${featuredArticle.meta.slug}`}>
                  <span>{featuredArticle.meta.publishedAt}</span>
                  <h3>{featuredArticle.meta.title}</h3>
                  <p>{featuredArticle.meta.summary}</p>
                </Link>
              </GlassCard>
            ) : null}
          </div>
          <nav className="content-paths" aria-label="内容入口">
            {contentPaths.map((item) => (
              <Link key={item.href} href={item.href}>
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </Link>
            ))}
          </nav>
        </div>
      </RevealSection>

      <RevealSection className="section-shell home-section">
        <SectionHeading
          index="02"
          title="最新文章"
          description="按发布时间展示公开的技术决策、实现过程与实践复盘。"
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
      </RevealSection>

      <RevealSection className="section-shell home-section">
        <SectionHeading
          index="03"
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
      </RevealSection>

      <RevealSection
        className="section-shell closing-section"
        aria-label="联系行动"
      >
        <p>从真实问题出发，让每次交付都能够解释、验证和复用。</p>
        <Link className="button primary-button" href="/contact">
          建立联系
        </Link>
      </RevealSection>
    </main>
  );
}
