import type { Theme } from 'vitepress';
import Layout from './Layout.vue';
// 自定义外壳只复用 Markdown 样式，避免加载默认导航、Hero 和字体。
import 'vitepress/dist/client/theme-default/styles/vars.css';
import 'vitepress/dist/client/theme-default/styles/base.css';
import 'vitepress/dist/client/theme-default/styles/icons.css';
import 'vitepress/dist/client/theme-default/styles/utils.css';
import 'vitepress/dist/client/theme-default/styles/components/custom-block.css';
import 'vitepress/dist/client/theme-default/styles/components/vp-code.css';
import 'vitepress/dist/client/theme-default/styles/components/vp-code-group.css';
import 'vitepress/dist/client/theme-default/styles/components/vp-doc.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/site.css';
import './styles/visual-effects.css';
import './styles/chat.css';

export default {
  Layout,
} satisfies Theme;
