"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 24);

    update();
    window.addEventListener("scroll", update, { passive: true });

    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="site-header" data-scrolled={isScrolled}>
      <Link className="brand-mark" href="/" aria-label="赵建斌个人网站首页">
        {siteConfig.mark}
      </Link>
      <nav className="desktop-nav" aria-label="主导航">
        {siteConfig.navigation.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <ThemeToggle />
      </nav>
      <details className="mobile-nav">
        <summary>菜单</summary>
        <nav aria-label="移动端主导航">
          {siteConfig.navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </details>
    </header>
  );
}
