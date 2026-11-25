"use client";

import { useEffect, useRef } from "react";

/** The 10-second loop made with HyperFrames: genuine sample output, muted, paused for reduced motion. */
export function LoopFilm() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (reduce.matches) element.pause();
      else element.play().catch(() => undefined);
    };
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, []);

  return (
    <figure className="film">
      <video ref={video} muted loop playsInline preload="metadata" poster="/fixmap-review-poster.jpg" aria-label="A task typed into FixMap becomes a review comment pinned to line 7 of reset-password.ts, followed by a test to run and a related file.">
        <source src="/fixmap-review.webm" type="video/webm" />
        <source src="/fixmap-review.mp4" type="video/mp4" />
      </video>
    </figure>
  );
}
