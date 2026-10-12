import type { DefaultTheme } from "vitepress";
import { tutorialGroups } from "./data/tutorials";

export const nav: DefaultTheme.NavItem[] = [
  { text: "首页", link: "/" },
  { text: "教程", link: "/tutorials/", activeMatch: "^/tutorials/" },
  { text: "专题", link: "/topics/", activeMatch: "^/topics/" },
  { text: "项目", link: "/projects/", activeMatch: "^/projects/" },
  { text: "关于", link: "/about" },
];

export const sidebar: DefaultTheme.SidebarMulti = {
  "/tutorials/": [
    { text: "教程总览", link: "/tutorials/" },
    ...tutorialGroups.map((group) => ({
      text: group.name,
      items: group.items.map((topic) => ({
        text: topic.name,
        collapsed: true,
        items: topic.chapters,
      })),
    })),
  ],
  "/topics/": [
    { text: "专题总览", link: "/topics/" },
    { text: "现代前端工程", link: "/topics/frontend-project.html" },
    { text: "Node.js 全栈应用", link: "/topics/fullstack-project.html" },
    { text: "浏览器插件", link: "/topics/browser-project.html" },
    { text: "本地优先的 Agent", link: "/topics/local-agent.html" },
  ],
};
