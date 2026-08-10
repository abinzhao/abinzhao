import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand-mark" href="/" aria-label="赵建斌个人网站首页">
        {siteConfig.mark}
      </Link>
      <nav className="desktop-nav" aria-label="主导航">
        {siteConfig.navigation.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <details className="mobile-nav">
        <summary>菜单</summary>
        <nav aria-label="移动端主导航">
          {siteConfig.navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </details>
    </header>
  );
}
