import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Layout from './Layout.vue';
import LabIndex from './components/LabIndex.vue';
import ParticleFieldDemo from './components/ParticleFieldDemo.vue';
import ProjectIndex from './components/ProjectIndex.vue';
import ConceptFlow from './components/ConceptFlow.vue';
import TutorialCatalog from './components/TutorialCatalog.vue';
import VisualPlayground from './components/VisualPlayground.vue';
import ParticleField from './components/ParticleField.vue';
import FrameBudget from './components/FrameBudget.vue';
import './styles/base.css';
import './styles/content.css';
import './styles/tutorials.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('LabIndex', LabIndex);
    app.component('ParticleFieldDemo', ParticleFieldDemo);
    app.component('ProjectIndex', ProjectIndex);
    app.component('ConceptFlow', ConceptFlow);
    app.component('TutorialCatalog', TutorialCatalog);
    app.component('VisualPlayground', VisualPlayground);
    app.component('ParticleField', ParticleField);
    app.component('FrameBudget', FrameBudget);
  },
} satisfies Theme;
