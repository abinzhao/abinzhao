function getDocument(root: Document | HTMLElement): Document {
  return root instanceof Document ? root : root.ownerDocument;
}

export function initNavigation(
  root: Document | HTMLElement = document,
): void {
  const pageDocument = getDocument(root);
  const header = root.querySelector<HTMLElement>("[data-site-header]");
  const menuToggle =
    root.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const mobileNavigation = root.querySelector<HTMLElement>(
    "[data-mobile-navigation]",
  );
  const backToTop =
    root.querySelector<HTMLButtonElement>("[data-back-to-top]");

  pageDocument.documentElement.classList.add("navigation-ready");

  const closeMenu = (): void => {
    if (!menuToggle || !mobileNavigation) {
      return;
    }

    menuToggle.setAttribute("aria-expanded", "false");
    mobileNavigation.hidden = true;
  };

  const updateScrollState = (): void => {
    header?.setAttribute(
      "data-scrolled",
      window.scrollY > 24 ? "true" : "false",
    );

    if (backToTop) {
      backToTop.hidden = window.scrollY <= window.innerHeight;
    }
  };

  if (menuToggle && mobileNavigation) {
    mobileNavigation.hidden = true;
    menuToggle.addEventListener("click", () => {
      const willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
      menuToggle.setAttribute("aria-expanded", String(willOpen));
      mobileNavigation.hidden = !willOpen;
    });

    mobileNavigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    pageDocument.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        menuToggle.focus();
      }
    });
  }

  backToTop?.addEventListener("click", () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", updateScrollState, { passive: true });
  updateScrollState();
}
