import { labExperiments } from './labs';
import { projects } from './projects';
import { tutorialChapters, tutorialStages } from './tutorials';
import { recentUpdates } from './updates';
import type { SearchItem } from '../theme/utils/search';

export const searchContentItems: SearchItem[] = [
  ...tutorialStages.map((stage) => ({
    id: `tutorial-${stage.id}`,
    type: '教程',
    title: stage.title,
    summary: stage.description,
    tags: stage.technologies,
    href: stage.href,
  })),
  ...tutorialChapters.map((chapter) => ({
    id: `chapter-${chapter.href}`,
    type: '教程',
    title: chapter.title,
    summary: chapter.summary,
    tags: [chapter.group, chapter.stage],
    href: chapter.href,
  })),
  ...projects.map((project) => ({
    id: `project-${project.repo}`,
    type: '项目',
    title: project.title,
    summary: project.description,
    tags: [project.category, project.language, ...project.topics].filter(Boolean),
    href: `/projects/#${project.repo}`,
  })),
  ...labExperiments.map((experiment) => ({
    id: `lab-${experiment.id}`,
    type: '实验',
    title: experiment.title,
    summary: experiment.summary,
    tags: [experiment.category, ...experiment.technologies],
    href: experiment.href,
  })),
  ...recentUpdates.map((update) => ({
    id: `update-${update.id}`,
    type: update.type,
    title: update.title,
    summary: update.summary,
    tags: update.tags,
    href: update.href,
  })),
];
