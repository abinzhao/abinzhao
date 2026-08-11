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

const initialize = () => initializeArticleCodeBlocks();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}

document.addEventListener("astro:page-load", initialize);
