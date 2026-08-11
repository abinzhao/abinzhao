export function initializeProjectFilters(root: HTMLElement): void {
  const buttons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-category]"),
  );
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-project-category]"),
  );
  const emptyState = document.querySelector<HTMLElement>(
    "[data-project-empty]",
  );

  const applyCategory = (category: string | null, updateUrl: boolean) => {
    let visibleCount = 0;

    for (const card of cards) {
      const visible =
        !category || card.dataset.projectCategory === category;
      card.hidden = !visible;
      visibleCount += Number(visible);
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }

    for (const button of buttons) {
      const buttonCategory = button.dataset.category;
      const selected = category
        ? buttonCategory === category
        : buttonCategory === "all";
      button.setAttribute("aria-pressed", String(selected));
    }

    if (updateUrl) {
      const url = new URL(window.location.href);
      if (category) {
        url.searchParams.set("category", category);
      } else {
        url.searchParams.delete("category");
      }
      window.history.pushState({}, "", url);
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      applyCategory(category === "all" ? null : (category ?? null), true);
    });
  }

  window.addEventListener("popstate", () => {
    applyCategory(new URL(window.location.href).searchParams.get("category"), false);
  });

  applyCategory(
    new URL(window.location.href).searchParams.get("category"),
    false,
  );
}
