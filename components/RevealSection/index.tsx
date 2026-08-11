"use client";

import {
  type ComponentPropsWithoutRef,
  useEffect,
  useRef,
} from "react";

type RevealSectionProps = ComponentPropsWithoutRef<"section">;

export function RevealSection({
  className = "",
  ...props
}: RevealSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section || typeof IntersectionObserver === "undefined") {
      return;
    }

    section.classList.add("is-reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          section.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  const revealClassName = [
    "reveal-section",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <section ref={sectionRef} className={revealClassName} {...props} />;
}
