import { Loader2 } from "lucide-react";

/**
 * Bouton unique pour toute l'application — remplace les dizaines de
 * `className` inline dupliquées (chaque page avait sa propre variante
 * légèrement différente). Polymorphe via `as` (ex: `as={Link}` pour un lien
 * de navigation React Router stylé comme un bouton, `as="a"` pour un lien
 * externe) — un bouton "+ Nouvelle cliente" est un lien, pas un <button>.
 *
 * variant :
 *  - primary   : action principale de la page (une seule par écran en général)
 *  - secondary : action secondaire (bordure neutre)
 *  - ghost     : action tertiaire discrète (texte souligné, ex: "Voir")
 *  - danger    : action destructive/annulation (rouge)
 * size : sm | md
 */
const VARIANTS = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 disabled:hover:bg-brand-600",
  secondary:
    "border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
  ghost:
    "text-neutral-600 dark:text-neutral-400 underline hover:text-neutral-900 dark:hover:text-neutral-100",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600",
  "danger-ghost":
    "text-red-600 dark:text-red-400 underline hover:text-red-700 dark:hover:text-red-300",
};

const SIZES = {
  sm: "text-xs px-2.5 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
};

export default function Button({
  as: Component = "button",
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}) {
  const isGhost = variant === "ghost" || variant === "danger-ghost";
  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
        isGhost ? "" : "shadow-sm"
      } ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className={size === "sm" ? "size-3.5 animate-spin" : "size-4 animate-spin"} aria-hidden="true" />
      ) : (
        Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
      )}
      {children}
    </Component>
  );
}
