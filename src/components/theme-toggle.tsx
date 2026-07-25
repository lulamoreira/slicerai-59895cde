import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const opts: { v: ThemePref; label: string; Icon: typeof Sun }[] = [
    { v: "light", label: "Claro", Icon: Sun },
    { v: "dark", label: "Escuro", Icon: Moon },
    { v: "system", label: "Auto", Icon: Monitor },
  ];
  return (
    <div className={cn("inline-flex rounded-full border bg-card p-1 gap-1", className)}>
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => setTheme(v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            theme === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
          aria-pressed={theme === v}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
