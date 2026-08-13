export const siteBase = "/abinzhao";

export function withBase(path: string): string {
  if (
    path.startsWith("#") ||
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    path.startsWith("//")
  ) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (
    normalizedPath === siteBase ||
    normalizedPath.startsWith(`${siteBase}/`)
  ) {
    return normalizedPath;
  }

  return `${siteBase}${normalizedPath}`;
}

export function withoutBase(path: string): string {
  if (path === siteBase || path === `${siteBase}/`) {
    return "/";
  }

  return path.startsWith(`${siteBase}/`) ? path.slice(siteBase.length) : path;
}

export const site = {
  name: "ZJB.DEV",
  owner: "赵建斌",
  title: "ZJB.DEV｜前端、鸿蒙与 AI 应用实践",
  description:
    "赵建斌关于前端工程、HarmonyOS 与 AI 应用架构的文章、项目和实践记录。",
  slogan: "在鸿蒙上，用前端的方式，把 AI 变成应用。",
  url: "https://abinzhao.github.io/abinzhao",
  navigation: [
    { href: withBase("/"), label: "首页" },
    { href: withBase("/blog/"), label: "文章" },
    { href: withBase("/projects/"), label: "项目" },
    { href: withBase("/playground/"), label: "实验" },
    { href: withBase("/about/"), label: "关于" },
    { href: withBase("/search/"), label: "搜索" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/abinzhao" },
    { label: "掘金", href: "https://juejin.cn/user/2849548342403454" },
  ],
} as const;
