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
  name: "abinzhao",
  owner: "阿斌",
  nickname: "纯爱掌门人",
  title: "abinzhao｜前端、鸿蒙与 AI 应用实践",
  description:
    "阿斌关于前端工程、HarmonyOS 与 AI 应用架构的文章、项目、实验和本地工具。",
  slogan: "在鸿蒙上，用前端的方式，把 AI 变成应用。",
  url: "https://abinzhao.github.io/abinzhao",
  navigation: [
    { href: withBase("/"), label: "首页" },
    { href: withBase("/projects/"), label: "项目" },
    { href: withBase("/blog/"), label: "文章" },
    { href: withBase("/playground/"), label: "实验" },
    { href: withBase("/toolbox/"), label: "工具箱" },
    { href: withBase("/about/"), label: "关于" },
  ],
  social: [
    { label: "GitHub", href: "https://github.com/abinzhao" },
    { label: "邮箱", href: "mailto:abin_v@163.com" },
    { label: "掘金", href: "https://juejin.cn/user/2849548342403454" },
    { label: "CSDN", href: "https://blog.csdn.net/qq_44924880" },
  ],
} as const;
