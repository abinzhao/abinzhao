import type { Metadata } from "next";
import { AmbientLight } from "@/components/AmbientLight";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getSiteUrl, siteConfig } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: siteConfig.title,
    template: `%s｜${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  alternates: {
    types: {
      "application/rss+xml": "/rss.xml",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key="personal-site-theme";var saved=localStorage.getItem(key);var dark=matchMedia("(prefers-color-scheme: dark)").matches;var theme=saved==="light"||saved==="dark"?saved:(dark?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(_){document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}})();`,
          }}
        />
        <ThemeProvider>
          <AmbientLight />
          <a className="skip-link" href="#main-content">
            跳到主要内容
          </a>
          <div className="site-frame">
            <SiteHeader />
            <div id="main-content">{children}</div>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
