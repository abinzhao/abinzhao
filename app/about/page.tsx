import type { Metadata } from "next";
import { profile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "关于",
  description: "赵建斌的专业方向、能力边界与工作原则。",
};

export default function AboutPage() {
  return (
    <main className="page-shell">
      <header className="page-intro">
        <p className="page-kicker">ABOUT / PROFILE</p>
        <h1 className="page-title">关于赵建斌</h1>
        <p className="page-description">
          专注前端工程、HarmonyOS 与跨端应用开发，重视问题定义、实现边界和可验证交付。
        </p>
      </header>

      <section className="page-content" aria-labelledby="roles-title">
        <h2 id="roles-title">专业方向</h2>
        <ul className="principle-list">
          {profile.roles.map((role, index) => (
            <li key={role}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{role}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-content" aria-labelledby="technologies-title">
        <h2 id="technologies-title">技术方向</h2>
        <ul className="technology-list" aria-labelledby="technologies-title">
          {profile.technologies.map((technology) => (
            <li key={technology}>{technology}</li>
          ))}
        </ul>
      </section>

      <section className="page-content" aria-labelledby="principles-title">
        <h2 id="principles-title">工作原则</h2>
        <ul className="principle-list">
          {profile.principles.map((principle, index) => (
            <li key={principle}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{principle}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
