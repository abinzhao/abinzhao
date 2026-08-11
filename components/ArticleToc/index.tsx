"use client";

import { useEffect, useState } from "react";
import type { ArticleHeading } from "@/lib/article-presentation";

type ArticleTocProps = {
  /** 正文中可导航的二级和三级标题。 */
  headings: ArticleHeading[];
};

export function ArticleToc({ headings }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    if (
      headings.length < 2 ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleHeading = entries.find((entry) => entry.isIntersecting);

        if (visibleHeading) {
          setActiveId(visibleHeading.target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px" },
    );

    headings.forEach(({ id }) => {
      const heading = document.getElementById(id);

      if (heading) {
        observer.observe(heading);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) {
    return null;
  }

  return (
    <nav className="article-toc" aria-label="文章目录">
      <p>目录</p>
      <ol>
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a
              href={`#${heading.id}`}
              aria-current={
                activeId === heading.id ? "location" : undefined
              }
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
