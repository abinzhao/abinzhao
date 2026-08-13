const enhancedAttribute = "data-copy-enhanced";

export function initializeArticleCodeBlocks(
  root: ParentNode = document,
): void {
  const blocks = root.querySelectorAll<HTMLPreElement>(
    `pre:not([${enhancedAttribute}])`,
  );

  for (const block of blocks) {
    block.setAttribute(enhancedAttribute, "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "article-copy-button";
    button.textContent = "复制代码";

    button.addEventListener("click", async () => {
      try {
        const code = block.querySelector("code")?.textContent ?? block.textContent ?? "";
        await navigator.clipboard.writeText(code);
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
    });

    block.append(button);
  }
}

function initializeReadingProgress(): void {
  const indicator = document.querySelector<HTMLElement>(
    "[data-reading-progress-bar]",
  );
  const article = document.querySelector<HTMLElement>(".article-detail");
  if (!indicator || !article) return;

  const update = () => {
    const start = article.offsetTop;
    const distance = Math.max(article.offsetHeight - window.innerHeight, 1);
    const progress = Math.min(Math.max((window.scrollY - start) / distance, 0), 1);
    indicator.style.transform = `scaleX(${progress})`;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

function initializeTocHighlight(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".article-toc a")];
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((heading): heading is HTMLElement => Boolean(heading));
  if (links.length === 0 || headings.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const current = entries.find((entry) => entry.isIntersecting);
      if (!current) return;
      links.forEach((link) => {
        link.toggleAttribute("aria-current", link.hash === `#${current.target.id}`);
      });
    },
    { rootMargin: "-18% 0px -72% 0px" },
  );
  headings.forEach((heading) => observer.observe(heading));
}

function initializeFeedback(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-article-feedback]");
  const status = document.querySelector<HTMLElement>("[data-feedback-status]");
  if (!button || !status) return;

  button.addEventListener(
    "click",
    () => {
      button.disabled = true;
      button.setAttribute("aria-pressed", "true");
      status.textContent = "已记下，谢谢你认真读到这里。";
    },
    { once: true },
  );
}

const initialize = () => {
  initializeArticleCodeBlocks();
  initializeReadingProgress();
  initializeTocHighlight();
  initializeFeedback();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}

document.addEventListener("astro:page-load", initialize);
