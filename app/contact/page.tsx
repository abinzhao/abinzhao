import type { Metadata } from "next";
import { profile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "联系",
  description: "联系赵建斌或订阅公开技术内容。",
};

export default function ContactPage() {
  return (
    <main className="page-shell">
      <header className="page-intro">
        <p className="page-kicker">CONTACT / CONNECT</p>
        <h1 className="page-title">联系赵建斌</h1>
        <p className="page-description">
          可以通过公开技术社区查看项目和内容。站点不会用示例邮箱代替真实联系入口。
        </p>
        <div className="public-links">
          {profile.socialLinks.map((link) => (
            <a
              key={link.href}
              aria-label={link.label}
              href={link.href}
              rel="noreferrer"
              target="_blank"
            >
              <strong>{link.label}</strong>
              <span>{link.description}</span>
            </a>
          ))}
          <a href="/rss.xml">
            <strong>RSS</strong>
            <span>订阅站内公开文章</span>
          </a>
        </div>
      </header>

      <section className="page-content" aria-labelledby="contact-form-title">
        <h2 id="contact-form-title">联系表单</h2>
        <p>联系表单将在服务确认后开放。</p>
        <form className="contact-form-preview">
          <label>
            称呼
            <input disabled name="name" />
          </label>
          <label>
            邮箱
            <input disabled name="email" type="email" />
          </label>
          <label>
            联系主题
            <select disabled name="subject">
              <option>请选择</option>
            </select>
          </label>
          <label>
            正文
            <textarea disabled name="message" />
          </label>
          <button disabled type="submit">
            暂未开放提交
          </button>
        </form>
      </section>
    </main>
  );
}
