import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Section repliable générique (native <details>/<summary> — accessible et
 * sans JS pour l'état de base). `defaultOpen` ouvre la section au premier
 * rendu ; utile pour ne pas cacher par défaut un groupe qui contient déjà
 * des valeurs saisies (voir usages dans les mensurations).
 */
export default function Disclosure({ label, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
    >
      <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer select-none text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/60 list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {label}
          {badge != null && (
            <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">{badge}</span>
          )}
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </summary>
      <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">{children}</div>
    </details>
  );
}
