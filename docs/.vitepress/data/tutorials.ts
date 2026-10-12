export interface TutorialChapter {
  text: string;
  link: string;
}

export interface TutorialTopic {
  id: string;
  name: string;
  description: string;
  link: string;
  chapters: TutorialChapter[];
}

export interface TutorialGroup {
  id: string;
  index: string;
  name: string;
  description: string;
  accent: "cyan" | "magenta" | "mint" | "amber";
  items: TutorialTopic[];
}

function topic(
  id: string,
  name: string,
  description: string,
  chapters: [string, string][],
): TutorialTopic {
  const pages = chapters.map(([text, path]) => ({
    text,
    link: `/tutorials/${path}.html`,
  }));
  return { id, name, description, link: pages[0].link, chapters: pages };
}

export const tutorialGroups: TutorialGroup[] = [
  {
    id: "foundation", index: "01", name: "工程基础", accent: "cyan",
    description: "掌握版本管理、终端命令与可重复的自动化工作流。",
    items: [
      topic("git", "Git", "版本模型、分支协作与历史恢复。", [
        ["基础与工作模型", "git-basics"],
        ["分支与协作工作流", "git/workflow"],
        ["撤销与历史恢复", "git/recovery"],
      ]),
      topic("shell", "Shell", "命令组合、脚本与自动化实践。", [
        ["终端与常用命令", "shell/essentials"],
        ["脚本与错误处理", "shell/scripting"],
        ["自动化开发工作流", "shell/automation"],
      ]),
    ],
  },
  {
    id: "frontend", index: "02", name: "前端基础", accent: "magenta",
    description: "从文档与布局，到语言、异步模型和类型边界。",
    items: [
      topic("html", "HTML", "语义结构、表单与可访问性。", [
        ["文档结构与语义", "html/document"],
        ["表单与原生校验", "html/forms"],
        ["可访问性实践", "html/accessibility"],
      ]),
      topic("css", "CSS", "层叠、布局与响应式视觉系统。", [
        ["层叠与盒模型", "css/foundations"],
        ["布局与响应式", "css/layouts"],
        ["设计系统与光感材质", "css/systems"],
      ]),
      topic("javascript", "JavaScript", "语言核心、异步与浏览器交互。", [
        ["语言与模块", "javascript/language"],
        ["异步与并发控制", "javascript/async"],
        ["DOM、事件与请求", "javascript/dom"],
      ]),
      topic("typescript", "TypeScript", "类型建模、工程配置与数据校验。", [
        ["类型与收窄", "typescript/types"],
        ["泛型与工程应用", "typescript/applications"],
        ["数据与运行时边界", "typescript/boundaries"],
      ]),
    ],
  },
  {
    id: "frameworks", index: "03", name: "前端框架", accent: "mint",
    description: "理解组件与响应式，完成有真实交互的应用。",
    items: [
      topic("react", "React", "组件、Hooks、状态与应用架构。", [
        ["组件与渲染模型", "react/components"],
        ["状态与副作用", "react/state"],
        ["应用组织与实践", "react/applications"],
      ]),
      topic("vue", "Vue", "响应式、组合式 API 与应用实践。", [
        ["响应式与组件基础", "vue/reactivity"],
        ["组合式 API 与复用", "vue/composition"],
        ["应用组织与实践", "vue/applications"],
      ]),
    ],
  },
  {
    id: "platform", index: "04", name: "平台工程", accent: "amber",
    description: "连接浏览器、运行环境、工程工具链与服务端。",
    items: [
      topic("nodejs", "Node.js", "环境管理、运行时与命令行工具。", [
        ["安装、版本与环境", "nodejs/environment"],
        ["事件循环、文件与流", "nodejs/runtime"],
        ["CLI 工具开发", "nodejs/tools"],
      ]),
      topic("browser", "浏览器", "导航渲染、网络缓存与调试。", [
        ["导航与渲染机制", "browser/architecture"],
        ["网络、缓存与安全", "browser/network"],
        ["DevTools 与性能诊断", "browser/debugging"],
      ]),
      topic("browser-extensions", "浏览器与插件", "Manifest V3、消息通信与发布。", [
        ["扩展架构与权限", "browser-extensions/fundamentals"],
        ["实现一个浏览器插件", "browser-extensions/implementation"],
        ["调试、打包与发布", "browser-extensions/delivery"],
      ]),
      topic("modern-frontend", "现代前端工程化", "构建、类型、测试与自动化发布。", [
        ["Vite 与工具链", "modern-frontend/toolchain"],
        ["类型、Lint 与测试", "modern-frontend/quality"],
        ["构建与持续交付", "modern-frontend/delivery"],
      ]),
      topic("node-fullstack", "Node.js 全栈", "HTTP API、数据库与生产运行。", [
        ["HTTP API 与前后端联调", "node-fullstack/http"],
        ["数据建模与事务", "node-fullstack/database"],
        ["鉴权、测试与生产运行", "node-fullstack/production"],
        ["任务应用全栈实战", "node-fullstack/task-app"],
      ]),
    ],
  },
  {
    id: "intelligence", index: "05", name: "智能与语言", accent: "cyan",
    description: "从本地优先的智能应用，到系统工具和脚本工程。",
    items: [
      topic("ai-agent", "AI Agent", "模型、工具边界与可重复评测。", [
        ["Agent 与数据边界", "ai-agent/foundations"],
        ["工具调用与权限", "ai-agent/tools"],
        ["评测与可靠性", "ai-agent/evaluation"],
      ]),
      topic("rust", "Rust", "所有权、CLI 与可靠工程。", [
        ["所有权与错误处理", "rust/ownership"],
        ["命令行工具实践", "rust/cli"],
        ["测试、并发与发布", "rust/engineering"],
      ]),
      topic("python", "Python", "语言基础、自动化与工程管理。", [
        ["语法与数据结构", "python/fundamentals"],
        ["标准库与自动化", "python/automation"],
        ["环境、类型与测试", "python/engineering"],
      ]),
    ],
  },
];
