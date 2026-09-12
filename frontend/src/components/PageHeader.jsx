/**
 * En-tête de page unique — remplace les `<h1 className="text-xl font-...">`
 * répétés sur chaque page avec des variantes légèrement différentes.
 * `icon` : composant lucide, affiché dans un médaillon discret (identité
 * visuelle cohérente avec la sidebar, qui utilise la même icône par module).
 * `actions` : zone à droite (bouton principal, sélecteur de période...).
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-950 dark:to-brand-900 text-brand-700 dark:text-brand-400 ring-1 ring-inset ring-brand-200/60 dark:ring-brand-800/60">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
