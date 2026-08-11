import type { Metadata } from "next";
import { profile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "关于",
  description: "赵建斌的专业方向、能力边界与工作原则。",
};

const abilityEvolution = [
  {
    title: "跨端界面",
    technologies: profile.technologies.slice(0, 3),
    description: profile.roles.slice(1).join(" / "),
  },
  {
    title: "前端工程",
    technologies: profile.technologies.slice(3, 8),
    description: profile.roles[0],
  },
  {
    title: "智能开发",
    technologies: profile.technologies.slice(8),
    description: profile.principles[1],
  },
] as const;

export default function AboutPage() {
  return (
    <main className="page-shell about-layout">
      <header className="page-intro about-profile">
        <p className="page-kicker">ABOUT / PROFILE</p>
        <h1 className="page-title">关于赵建斌</h1>
        <p className="page-description">
          专注前端工程、HarmonyOS 与跨端应用开发，重视问题定义、实现边界和可验证交付。
        </p>
        <section aria-labelledby="roles-title">
          <h2 id="roles-title">专业方向</h2>
          <ul className="about-role-list">
            {profile.roles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="technologies-title">
          <h2 id="technologies-title">技术方向</h2>
          <ul className="technology-list" aria-labelledby="technologies-title">
            {profile.technologies.map((technology) => (
              <li key={technology}>{technology}</li>
            ))}
          </ul>
        </section>
      </header>

      <section
        className="page-content ability-evolution"
        aria-labelledby="evolution-title"
      >
        <h2 id="evolution-title">能力演进</h2>
        <ol>
          {abilityEvolution.map((stage, index) => (
            <li key={stage.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{stage.title}</h3>
                <p>{stage.description}</p>
                <p
                  aria-label={`${stage.title}技术`}
                  className="ability-evolution__technologies"
                >
                  {stage.title}：{stage.technologies.join(" / ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <section
          className="about-principles"
          aria-labelledby="principles-title"
        >
          <h3 id="principles-title">工作原则</h3>
          <ul className="principle-list">
            {profile.principles.map((principle, index) => (
              <li key={principle}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{principle}</p>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
