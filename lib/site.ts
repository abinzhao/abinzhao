export const siteConfig = {
  name: "赵建斌",
  mark: "ZJB.DEV",
  title: "赵建斌｜前端与 HarmonyOS 开发",
  description:
    "赵建斌的个人技术网站，记录前端、HarmonyOS 与跨端应用开发实践。",
  navigation: [
    { href: "/", label: "首页" },
    { href: "/work", label: "项目" },
    { href: "/writing", label: "文章" },
    { href: "/about", label: "关于" },
    { href: "/contact", label: "联系" },
  ],
} as const;

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
