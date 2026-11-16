// Masquage des informations financières pour un employé qui n'a pas la permission « finances.voir ».
//
// Les réponses de production (commandes, modèles, stock, tableau de bord…) mêlent données de travail et montants.
// Plutôt que de modifier chaque route, un middleware retire des réponses JSON, à tous les niveaux, les clés qui portent
// un montant. Le PDG et les employés autorisés ne sont jamais touchés.
//
// GARDE-FOU : la liste ci-dessous est une liste de clés à masquer ; un montant ajouté plus tard au schéma ne serait pas
// masqué tout seul. Le test `masquageFinances.test.js` lit schema.prisma et échoue si une colonne Decimal n'est pas
// classée ici soit comme financière, soit comme non financière : impossible d'ajouter un montant sans y réfléchir.
import { peutVoirFinances } from "./permissions.js";

/** Clés de réponse qui portent un montant, ou une collection de montants (paiements, dépenses). */
export const CLES_FINANCIERES = new Set([
  "prixTotal",
  "totalPaye",
  "solde",
  "statutPaiement",
  "paiements",
  "paiementInitial",
  "paiementFinal",
  "montantRestant",
  "montantPaye",
  "prixIndicatif",
  "prixUnitaire",
  "totalRestant",
  "totalCommandes",
  "depenses",
  "depense",
  "depenseId",
  "montantTotal",
]);

/** Colonnes Decimal du schéma → financière (true, ou la clé masquée) ou non (false). Exhaustif, vérifié par test. */
export const CLASSEMENT_DECIMAL = {
  "Mesure.*": false, // mesures en cm
  "Modele.prixIndicatif": true,
  "Commande.prixTotal": true,
  "Paiement.montant": true, // jamais renvoyé sous cette clé hors des routes protégées par paiements.*
  "Livraison.montantRestant": true,
  "Recu.montantPaye": true,
  "Depense.montant": true, // module depenses.* uniquement
  "ArticleStock.seuilAlerte": false, // quantité
  "ArticleStock.prixUnitaire": true,
  "LigneAchat.prixUnitaire": true, // achats : masqué sans finances.voir
  "LigneAchat.quantite": false, // quantité
  "LigneAchat.quantiteRecue": false, // quantité
  "MouvementStock.quantite": false, // quantité
  "FormuleAbonnement.prix": false, // abonnement de la PLATEFORME, jamais accessible à un employé (routes ADMIN)
  "Abonnement.prix": false,
  "Transaction.montant": false,
  "FactureAbonnement.montant": false,
  "PlanAbonnement.prixMensuel": false,
};

function masquer(valeur) {
  if (Array.isArray(valeur)) return valeur.map(masquer);
  // Seuls les objets simples sont parcourus : dates, Decimal et autres instances sont laissés tels quels.
  if (valeur && typeof valeur === "object" && Object.getPrototypeOf(valeur) === Object.prototype) {
    const resultat = {};
    for (const [cle, v] of Object.entries(valeur)) {
      if (!CLES_FINANCIERES.has(cle)) resultat[cle] = masquer(v);
    }
    return resultat;
  }
  return valeur;
}

export const masquerFinances = masquer;

/**
 * Middleware : si le compte n'a pas « finances.voir », retire les montants de toute réponse JSON. À placer APRÈS
 * l'authentification. Les réponses non JSON (PDF, CSV) ne passent pas par ici : leurs routes décident elles-mêmes.
 */
export function masquerFinancesSiNonAutorise(req, res, next) {
  if (peutVoirFinances(req.user)) return next();
  const envoyerJson = res.json.bind(res);
  res.json = (corps) => envoyerJson(masquer(corps));
  next();
}
