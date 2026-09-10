/**
 * Conteneur de contenu unique — remplace les `rounded-lg/xl border p-4`
 * dupliqués partout. Deux variantes seulement, choisies délibérément pour
 * éviter l'effet "tout est une carte avec bordure" :
 *
 *  - "surface" (défaut) : fond légèrement distinct du fond de page, SANS
 *    bordure — pour la majorité des blocs de contenu (infos, sections de
 *    fiche). La séparation vient du fond, pas d'un trait.
 *  - "outlined" : bordure fine, réservée aux éléments qui doivent se
 *    distinguer nettement (tableaux, formulaires, zones d'action).
 *
 * `padded` (défaut true) applique le padding standard (p-5) ; désactiver
 * pour un tableau qui gère son propre padding par cellule.
 */
export default function Card({ as: Component = "div", variant = "surface", padded = true, className = "", children, ...props }) {
  const base = "rounded-2xl";
  const surface =
    variant === "surface"
      ? "bg-neutral-100/70 dark:bg-neutral-900/70"
      : "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm";
  return (
    <Component className={`${base} ${surface} ${padded ? "p-5" : ""} ${className}`} {...props}>
      {children}
    </Component>
  );
}
