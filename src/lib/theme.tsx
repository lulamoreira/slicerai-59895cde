import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemePref = "light" | "dark" | "system";
type Ctx = { theme: ThemePref; setTheme: (t: ThemePref) => void; resolved: "light" | "dark" };
const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "slicerai.theme";

function applyTheme(pref: ThemePref) {
  if (typeof document === "undefined") return "light" as const;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && (localStorage.getItem(STORAGE_KEY) as ThemePref)) || "system";
    setThemeState(saved);
    setResolved(applyTheme(saved));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(applyTheme(saved));
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: ThemePref) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    setResolved(applyTheme(t));
    // persist to profile if logged in
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) supabase.from("profiles").update({ theme: t }).eq("id", data.user.id);
    });
  };

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, resolved]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
