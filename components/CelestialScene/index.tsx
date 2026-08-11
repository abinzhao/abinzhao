"use client";

import { type ComponentType, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { StaticCelestial } from "./StaticCelestial";

type WebGLComponent = ComponentType<{
  onUnavailable: () => void;
}>;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) =>
      setMatches(event.matches);

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export function CelestialScene() {
  const { theme } = useTheme();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const [WebGLCelestial, setWebGLCelestial] =
    useState<WebGLComponent | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const canUseWebGL =
    theme === "dark" && !isMobile && !prefersReducedMotion;

  useEffect(() => {
    if (!canUseWebGL) {
      return;
    }

    let isCurrent = true;

    import("./WebGLCelestial")
      .then((module) => {
        if (isCurrent) {
          setIsUnavailable(false);
          setWebGLCelestial(() => module.WebGLCelestial);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setIsUnavailable(true);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [canUseWebGL]);

  if (!canUseWebGL || !WebGLCelestial || isUnavailable) {
    return <StaticCelestial />;
  }

  return <WebGLCelestial onUnavailable={() => setIsUnavailable(true)} />;
}
