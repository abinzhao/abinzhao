import { experiments } from '../.vitepress/data/labs';

export default {
  paths: () => experiments.map((experiment) => ({
    params: { slug: experiment.id, title: experiment.title, description: experiment.description },
  })),
};
