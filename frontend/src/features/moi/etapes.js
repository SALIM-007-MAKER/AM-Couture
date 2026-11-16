// Les étapes d'une commande, dans l'ordre où elles se déroulent. Les retouches n'ont pas lieu pour toutes les commandes :
// elles restent affichées pour que la progression soit lisible, sans laisser croire qu'une étape a été « sautée ».
export const ETAPES_COMMANDE = ["NOUVELLE", "EN_CONFECTION", "ESSAYAGE", "RETOUCHES", "TERMINEE", "LIVREE"];

/**
 * État de chaque étape pour un statut donné : "fait", "en-cours" ou "a-venir". Une commande livrée a toutes ses étapes
 * faites (aucune « en cours »). Une commande annulée n'a aucune progression à montrer : liste vide.
 */
export function etatsEtapes(statut) {
  const courant = ETAPES_COMMANDE.indexOf(statut);
  if (courant === -1) return [];
  return ETAPES_COMMANDE.map((etape, i) => ({
    etape,
    etat: statut === "LIVREE" || i < courant ? "fait" : i === courant ? "en-cours" : "a-venir",
  }));
}
