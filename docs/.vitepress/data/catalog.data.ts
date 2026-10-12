import { createContentLoader } from "vitepress";
import { buildCatalog, type TutorialSummary } from "../content/catalog";

declare const data: TutorialSummary[];
export { data };

export default createContentLoader("tutorials/**/*.md", {
  transform: buildCatalog,
});
