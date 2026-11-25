"use client";

import { Moon, Sun } from "@phosphor-icons/react";

/** Dark is the default theme; the choice is remembered per browser. */
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("fixmap-theme", next);
    } catch {
      // Storage can be blocked; the switch still applies for this page view.
    }
  }

  return (
    <button className="theme-btn" type="button" onClick={toggle} aria-label="Switch between dark and light theme">
      <Moon className="moon" size={17} weight="bold" aria-hidden />
      <Sun className="sun" size={17} weight="bold" aria-hidden />
    </button>
  );
}
