export function initializeToolboxCatalog(root: Document = document): void {
  const catalog = root.querySelector<HTMLElement>("[data-toolbox-catalog]");
  if (!catalog || catalog.dataset.ready === "true") {
    return;
  }

  catalog.dataset.ready = "true";
  const input = catalog.querySelector<HTMLInputElement>("[data-tool-search]");
  const buttons = Array.from(
    catalog.querySelectorAll<HTMLButtonElement>("[data-tool-group-filter]"),
  );
  const groups = Array.from(
    catalog.querySelectorAll<HTMLElement>("[data-toolbox-group]"),
  );
  const cards = Array.from(
    catalog.querySelectorAll<HTMLElement>("[data-tool-card]"),
  );
  let activeGroup = "all";

  const applyFilters = (): void => {
    const query = input?.value.trim().toLocaleLowerCase("zh-CN") ?? "";

    for (const card of cards) {
      const matchesGroup =
        activeGroup === "all" || card.dataset.toolGroup === activeGroup;
      const matchesQuery =
        card.textContent?.toLocaleLowerCase("zh-CN").includes(query) ?? false;
      card.hidden = !matchesGroup || !matchesQuery;
    }

    for (const group of groups) {
      group.hidden = !group.querySelector("[data-tool-card]:not([hidden])");
    }
  };

  input?.addEventListener("input", applyFilters);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      activeGroup = button.dataset.toolGroupFilter ?? "all";
      for (const candidate of buttons) {
        candidate.setAttribute(
          "aria-pressed",
          String(candidate === button),
        );
      }
      applyFilters();
    });
  }

  applyFilters();
}

initializeToolboxCatalog();
document.addEventListener("astro:page-load", () => initializeToolboxCatalog());
