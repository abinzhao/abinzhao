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

  const setMenuOpen = (open: boolean): void => {
    if (!menuToggle || !mobileNavigation) {
      return;
    }

    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    mobileNavigation.hidden = !open;
  };

  const closeMenu = (): void => setMenuOpen(false);

  let scrollFrame = 0;
  const updateScrollState = (): void => {
    header?.setAttribute(
      "data-scrolled",
      window.scrollY > 32 ? "true" : "false",
    );

    if (backToTop) {
      backToTop.hidden = window.scrollY <= window.innerHeight;
    }
  };
  const requestScrollUpdate = (): void => {
    if (scrollFrame) {
      return;
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScrollState();
    });
  };

  if (menuToggle && mobileNavigation) {
    closeMenu();
    menuToggle.addEventListener("click", () => {
      const willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
      setMenuOpen(willOpen);
    });

    mobileNavigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    pageDocument.addEventListener("pointerdown", (event) => {
      if (
        menuToggle.getAttribute("aria-expanded") === "true" &&
        event.target instanceof Node &&
        !mobileNavigation.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        closeMenu();
      }
    });

    pageDocument.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        menuToggle.getAttribute("aria-expanded") === "true"
      ) {
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

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  updateScrollState();
}
