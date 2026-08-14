export function initCommandPalette(root: Document = document): void {
  const palette = root.querySelector<HTMLElement>("[data-command-palette]");
  const input = root.querySelector<HTMLInputElement>("[data-command-input]");
  const empty = root.querySelector<HTMLElement>("[data-command-empty]");
  const openButtons = root.querySelectorAll<HTMLButtonElement>(
    "[data-command-open]",
  );

  if (!palette || !input || palette.dataset.ready === "true") {
    return;
  }
  palette.dataset.ready = "true";

  const items = [
    ...palette.querySelectorAll<HTMLElement>("[data-command-item]"),
  ];
  let previousFocus: HTMLElement | null = null;

  const filter = (): void => {
    const query = input.value.trim().toLocaleLowerCase("zh-CN");
    let visible = 0;
    for (const item of items) {
      const matches = (item.dataset.search ?? "")
        .toLocaleLowerCase("zh-CN")
        .includes(query);
      item.hidden = !matches;
      if (matches) visible += 1;
    }
    if (empty) empty.hidden = visible > 0;
  };

  const close = (): void => {
    palette.hidden = true;
    document.body.classList.remove("is-dialog-open");
    input.value = "";
    filter();
    previousFocus?.focus();
  };

  const open = (): void => {
    previousFocus =
      root.activeElement instanceof HTMLElement ? root.activeElement : null;
    palette.hidden = false;
    document.body.classList.add("is-dialog-open");
    window.requestAnimationFrame(() => input.focus());
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (palette.hidden) {
        open();
      } else {
        close();
      }
      return;
    }
    if (event.key === "Escape" && !palette.hidden) {
      event.preventDefault();
      close();
    }
  };

  input.addEventListener("input", filter);
  openButtons.forEach((button) => button.addEventListener("click", open));
  palette
    .querySelectorAll<HTMLElement>("[data-command-close]")
    .forEach((button) => button.addEventListener("click", close));
  palette.querySelector("[data-command-theme]")?.addEventListener("click", () => {
    root.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
    close();
  });
  root.addEventListener("keydown", handleKeydown);
}
