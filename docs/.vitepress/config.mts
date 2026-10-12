import { defineConfig } from "vitepress";
import { nav, sidebar } from "./nav";

const siteUrl = "https://abinzhao.github.io/abinzhao/";

export default defineConfig({
  lang: "zh-CN",
  title: "abinzhao",
  titleTemplate: ":title | abinzhao",
  description: "阿斌的技术教程、工程实践与长期积累。",
  base: "/abinzhao/",
  cleanUrls: false,
  lastUpdated: true,
  appearance: true,
  srcExclude: ["superpowers/**", "adr/**"],
  ignoreDeadLinks: false,
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/abinzhao/favicon.png" }],
    ["meta", { name: "theme-color", content: "#07090d" }],
    ["meta", { name: "author", content: "阿斌" }],
    ["meta", { property: "og:site_name", content: "abinzhao" }],
    ["meta", { property: "og:type", content: "website" }],
    [
      "meta",
      {
        property: "og:image",
        content: `${siteUrl}og-default.jpg`,
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    siteTitle: "abinzhao",
    nav,
    sidebar,
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/abinzhao" },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索",
                buttonAriaLabel: "搜索",
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "重置搜索",
                backButtonTitle: "关闭搜索",
                noResultsText: "没有找到相关内容",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车",
                  navigateText: "导航",
                  navigateUpKeyAriaLabel: "上箭头",
                  navigateDownKeyAriaLabel: "下箭头",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc",
                },
              },
            },
          },
        },
      },
    },
    lastUpdated: {
      text: "最后更新",
      formatOptions: {
        dateStyle: "medium",
        forceLocale: true,
      },
    },
    docFooter: {
      prev: "上一篇",
      next: "下一篇",
    },
    darkModeSwitchLabel: "主题",
    lightModeSwitchTitle: "切换到浅色主题",
    darkModeSwitchTitle: "切换到深色主题",
    sidebarMenuLabel: "学习路径",
    returnToTopLabel: "返回顶部",
    navMenuLabel: "主导航",
    mobileMenuLabel: "打开菜单",
    extraMenuLabel: "更多",
    skipToContentLabel: "跳到正文",
    externalLinkIcon: true,
    notFound: {
      code: "404",
      title: "这一页还没有收录",
      quote: "回到知识地图，继续寻找下一条学习路径。",
      linkLabel: "返回首页",
      linkText: "返回首页",
    },
    footer: {
      message: "记录能复现、能验证、能长期使用的技术。",
      copyright: "Copyright © 2026-present 阿斌",
    },
  },
});
