import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/manrope/wght.css";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import HomePage from "./components/HomePage.vue";
import TutorialIndex from "./components/TutorialIndex.vue";
import Layout from "./Layout.vue";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/content.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("HomePage", HomePage);
    app.component("TutorialIndex", TutorialIndex);
  },
} satisfies Theme;
