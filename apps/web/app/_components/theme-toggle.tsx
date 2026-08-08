"use client";

type Theme = "light" | "dark";

function resolvedTheme(): Theme {
  const stored = window.localStorage.getItem("fixmap-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  function toggleTheme() {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("fixmap-theme", next);
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle color theme">
      <span aria-hidden>◐</span>
      <span>Theme</span>
    </button>
  );
}
