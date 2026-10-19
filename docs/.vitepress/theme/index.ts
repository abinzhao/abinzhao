import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Layout from './Layout.vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/site.css';
import './styles/visual-effects.css';
import './styles/chat.css';

export default {
  extends: DefaultTheme,
  Layout,
} satisfies Theme;
