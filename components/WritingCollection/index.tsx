"use client";

import Link from "next/link";
import { useState } from "react";
import { getArticleTopics } from "@/lib/article-presentation";
import type { ArticleMeta } from "@/lib/content";

type WritingCollectionProps = {
  articles: ArticleMeta[];
};

export function WritingCollection({ articles }: WritingCollectionProps) {
  const topics = getArticleTopics(articles);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const visibleArticles = selectedTopic
    ? articles.filter(({ topic }) => topic === selectedTopic)
    : articles;

  return (
    <div className="page-content writing-collection">
      {topics.length > 1 ? (
        <div className="topic-filter" role="group" aria-label="文章分类">
          <button
            type="button"
            aria-pressed={selectedTopic === null}
            onClick={() => setSelectedTopic(null)}
          >
            全部
          </button>
          {topics.map((topic) => (
            <button
              key={topic}
              type="button"
              aria-pressed={selectedTopic === topic}
              onClick={() => setSelectedTopic(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      ) : null}
      <div className="writing-grid">
        {visibleArticles.map((article) => (
          <article className="writing-card" key={article.slug}>
            <Link href={`/writing/${article.slug}`}>
              <div className="writing-card__meta">
                <time dateTime={article.publishedAt}>
                  {article.publishedAt}
                </time>
                {article.topic ? <span>{article.topic}</span> : null}
              </div>
              <h2>{article.title}</h2>
              <p>{article.summary}</p>
              <ul aria-label="文章标签">
                {article.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
