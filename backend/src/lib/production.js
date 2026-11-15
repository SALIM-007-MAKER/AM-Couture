// Production : règles pures (aucun accès à la base) partagées par les routes et leurs tests.

/** Statuts d'une commande encore « en production » : ni livrée, ni annulée. */
export const STATUTS_OUVERTS = ["NOUVELLE", "EN_CONFECTION", "ESSAYAGE", "RETOUCHES", "TERMINEE"];

/** Début du jour (UTC) : une commande n'est en retard que le lendemain de la date prévue, jamais le jour même. */
export function debutDuJour(maintenant = new Date()) {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
}

/** Une commande est en retard si elle est encore ouverte et que sa date de livraison prévue est passée. */
export function estEnRetard(commande, maintenant = new Date()) {
  return STATUTS_OUVERTS.includes(commande.statut) && new Date(commande.dateLivraisonPrevue) < debutDuJour(maintenant);
}

/** Une commande peut être (ré)affectée tant qu'elle est ouverte. */
export const estAffectable = (statut) => STATUTS_OUVERTS.includes(statut);
