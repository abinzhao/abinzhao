import Link from "next/link";
import { profile } from "@/lib/profile";

export function Footer() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} 赵建斌</p>
      <div className="footer-links">
        {profile.socialLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        ))}
        <a href="/rss.xml">RSS</a>
        <Link href="/contact">联系</Link>
      </div>
      <span className="footer-easter-egg" title={profile.nickname}>
        ZJB / BUILD WITH CARE
      </span>
    </footer>
  );
}
