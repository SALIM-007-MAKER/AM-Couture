/**
 * Étiquette de champ de formulaire — jusqu'ici redéfinie à l'identique dans
 * chaque page de formulaire (Clientes, Modèles, Commandes, Dépenses,
 * Paramètres, Mesures). Un seul composant désormais.
 */
export function Field({ label, required, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

/** Classe commune input/select/textarea — un seul style de champ dans toute l'app. */
export const inputClass =
  "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors";
