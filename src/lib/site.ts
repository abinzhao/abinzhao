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
  title: "ZJB.DEV｜赵建斌的数字实验室",
  description: "赵建斌的项目、技术文章与创意代码实验室。",
  slogan: "把复杂，做得有意思。",
  url: "https://abinzhao.github.io/abinzhao",
  navigation: [
    { href: withBase("/"), label: "首页" },
    { href: withBase("/projects/"), label: "项目" },
    { href: withBase("/blog/"), label: "博客" },
    { href: withBase("/playground/"), label: "实验室" },
    { href: withBase("/about/"), label: "关于" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/abinzhao" },
    { label: "掘金", href: "https://juejin.cn/user/2849548342403454" },
  ],
} as const;
