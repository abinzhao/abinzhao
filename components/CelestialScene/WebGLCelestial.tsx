"use client";

import { useEffect, useRef } from "react";
import { createCelestialScene } from "./createCelestialScene";

type WebGLCelestialProps = {
  onUnavailable: () => void;
};

export function WebGLCelestial({ onUnavailable }: WebGLCelestialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      onUnavailableRef.current();
      return;
    }

    try {
      const controller = createCelestialScene(canvas);
      let isIntersecting = true;
      const syncPlayback = () => {
        if (isIntersecting && !document.hidden) {
          controller.resume();
        } else {
          controller.pause();
        }
      };
      const observer =
        typeof IntersectionObserver === "undefined"
          ? null
          : new IntersectionObserver(([entry]) => {
              isIntersecting = entry.isIntersecting;
              syncPlayback();
            });
      const handleVisibility = () => syncPlayback();
      const handleResize = () => controller.resize();

      observer?.observe(canvas);
      document.addEventListener("visibilitychange", handleVisibility);
      window.addEventListener("resize", handleResize);
      syncPlayback();

      return () => {
        observer?.disconnect();
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("resize", handleResize);
        controller.dispose();
      };
    } catch {
      onUnavailableRef.current();
    }
  }, []);

  return (
    <div
      className="webgl-celestial"
      data-testid="webgl-celestial"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
