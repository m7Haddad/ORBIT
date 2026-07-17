"use client";

/* Theme switching: sets data-theme on <html>; values live entirely in
 * src/styles/themes.css. Persisted to localStorage; a no-flash inline script
 * in the root layout applies the stored theme before first paint. */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export const THEMES = ["light", "dark", "midnight", "glass"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "orbit-theme";

function storedTheme(): Theme {
  // SSR renders with the default; the inline init script has already stamped
  // data-theme before hydration, so there is no visible flash either way.
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored && THEMES.includes(stored) ? stored : "dark";
}

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: "dark", setTheme: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Inline script body for the root layout — runs before hydration. */
export const themeInitScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(["light","dark","midnight","glass"].includes(t))document.documentElement.dataset.theme=t;else document.documentElement.dataset.theme="dark";}catch(e){document.documentElement.dataset.theme="dark";}`;
