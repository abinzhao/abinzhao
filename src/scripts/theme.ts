import {
  THEME_STORAGE_KEY,
  resolveInitialTheme,
  type Theme,
} from "@/lib/theme";

function getDocument(root: Document | HTMLElement): Document {
  return root instanceof Document ? root : root.ownerDocument;
}

function updateToggleLabels(root: Document | HTMLElement, theme: Theme): void {
  const nextThemeLabel = theme === "dark" ? "浅色" : "深色";

  root.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((toggle) => {
    toggle.setAttribute("aria-label", `切换到${nextThemeLabel}模式`);
  });
}

export function initThemeToggle(
  root: Document | HTMLElement = document,
): void {
  const pageDocument = getDocument(root);
  const html = pageDocument.documentElement;
  const initialTheme = resolveInitialTheme(html.dataset.theme, false);

  updateToggleLabels(root, initialTheme);

  root.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((toggle) => {
    if (toggle.dataset.themeReady === "true") {
      return;
    }

    toggle.dataset.themeReady = "true";
    toggle.addEventListener("click", () => {
      const currentTheme = resolveInitialTheme(html.dataset.theme, false);
      const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";

      html.dataset.theme = nextTheme;
      updateToggleLabels(root, nextTheme);
      pageDocument.dispatchEvent(
        new CustomEvent("zjb:themechange", {
          detail: { theme: nextTheme },
        }),
      );

      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // The visual theme remains usable when storage is unavailable.
      }
    });
  });
}
