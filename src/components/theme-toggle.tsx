"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "dark" | "light";

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("linkar-theme-change", callback);

  return () => {
    observer.disconnect();
    window.removeEventListener("linkar-theme-change", callback);
  };
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getThemeServerSnapshot(): Theme {
  return "light";
}

function storeTheme(theme: Theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;

  try {
    localStorage.setItem("linkar-theme", theme);
  } catch {
    // The theme still applies for this page when private storage is unavailable.
  }

  window.dispatchEvent(new Event("linkar-theme-change"));
}

export function ThemeToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className={className}
      type="button"
      onClick={() => storeTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
      {showLabel ? <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}
