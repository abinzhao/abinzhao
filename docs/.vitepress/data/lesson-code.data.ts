import { createMarkdownRenderer } from 'vitepress';

export declare const data: Record<string, string>;

const snippets: Record<string, string> = {
  git: '```bash\n# 先观察差异，再选择这次要保存的文件\ngit status\ngit diff\ngit add README.md\ngit commit -m "docs: add readme"\n```',
  'frontend-basics': '```html\n<!-- 让结构先表达含义 -->\n<main>\n  <article>\n    <h1>我的第一个项目</h1>\n    <p>结构、样式与交互，各司其职。</p>\n  </article>\n</main>\n```',
  'frontend-engineering': '```tsx\nimport { useState } from \'react\';\n\nexport default function Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <button onClick={() => setCount(n => n + 1)}>\n      已点击 {count} 次\n    </button>\n  );\n}\n```',
  backend: '```js\nimport { createServer } from \'node:http\';\n\ncreateServer((_request, response) => {\n  response.setHeader(\'Content-Type\', \'application/json\');\n  response.end(JSON.stringify({ status: \'ok\' }));\n}).listen(3000);\n```',
  fullstack: '```js\nconst response = await fetch(\'/api/notes\');\nif (!response.ok) {\n  throw new Error(`请求失败：${response.status}`);\n}\nconst notes = await response.json();\nconsole.table(notes);\n```',
  extensions: '```glsl\n// 时间参与颜色计算，形成流动的光场\nuniform float uTime;\nvarying vec2 vUv;\n\nvoid main() {\n  float wave = sin(vUv.x * 8.0 + uTime);\n  vec3 color = mix(vec3(0.2, 0.4, 1.0),\n                   vec3(0.3, 0.9, 0.7), wave * 0.5 + 0.5);\n  gl_FragColor = vec4(color, 1.0);\n}\n```',
};

export default {
  async load() {
    const renderer = await createMarkdownRenderer(process.cwd(), {
      theme: { light: 'github-light', dark: 'github-dark' },
    });
    return Object.fromEntries(Object.entries(snippets).map(([id, code]) => [id, renderer.render(code)]));
  },
};
