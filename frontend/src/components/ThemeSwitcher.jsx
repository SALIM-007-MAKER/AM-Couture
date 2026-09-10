import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "../stores/themeStore.js";

const OPTIONS = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
];

/** Sélecteur de thème clair/sombre - segmented control à 2 options, voir
 * stores/themeStore.js pour la logique (persistance dans localStorage). */
export default function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l'application"
      className="inline-flex gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-1"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] ${
              active
                ? "bg-white dark:bg-neutral-700 text-brand-700 dark:text-brand-300 shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            <opt.icon className="size-4" aria-hidden="true" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
