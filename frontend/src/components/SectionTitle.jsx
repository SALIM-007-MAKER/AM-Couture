/**
 * Titre de section — utilisé à l'intérieur d'une fiche (Cliente, Commande...)
 * pour séparer clairement "Cliente" / "Finances" / "Livraison" / etc., et
 * dans les pages de listing pour "Finances" / "Commandes" / "Clientes" des
 * Rapports. Un seul style de sous-titre dans toute l'app.
 */
export default function SectionTitle({ icon: Icon, children, actions }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {Icon && <Icon className="size-4" aria-hidden="true" />}
        {children}
      </h2>
      {actions}
    </div>
  );
}
