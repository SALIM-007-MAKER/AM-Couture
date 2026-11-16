// Vérification des invariants financiers et de cohérence (voir docs/INVARIANTS.md).
// Chaque fonction renvoie la LISTE des violations (tableau vide = tout est cohérent),
// pour que les tests affichent précisément ce qui est cassé plutôt qu'un simple échec.
//
// Lecture seule : jamais d'écriture. À n'exécuter que sur la base de test jetable
// (garantie par preload.js).
import { prisma } from "../lib/prisma.js";

/** I1, I2, I3, I4, I5, I6, I8 pour les commandes des ateliers donnés. */
export async function violationsFinancieres(atelierIds) {
  const ids = Array.isArray(atelierIds) ? atelierIds : [atelierIds];
  const v = [];

  const surpaye = await prisma.$queryRaw`
    SELECT c.numero, c."prixTotal"::text AS prix, COALESCE(SUM(p.montant), 0)::text AS paye
    FROM "Commande" c
    LEFT JOIN "Paiement" p ON p."commandeId" = c.id AND p."annuleAt" IS NULL
    WHERE c."atelierId" = ANY(${ids})
    GROUP BY c.id HAVING COALESCE(SUM(p.montant), 0) > c."prixTotal"`;
  for (const r of surpaye) v.push(`I1 commande ${r.numero} : payé ${r.paye} > prix ${r.prix}`);

  const montantsInvalides = await prisma.$queryRaw`
    SELECT p.id, p.montant::text AS montant FROM "Paiement" p
    JOIN "Commande" c ON c.id = p."commandeId"
    WHERE c."atelierId" = ANY(${ids}) AND p.montant <= 0`;
  for (const r of montantsInvalides) v.push(`I2 paiement ${r.id} : montant ${r.montant} <= 0`);

  const livraisonsMultiples = await prisma.$queryRaw`
    SELECT c.numero, COUNT(*)::int AS n FROM "Livraison" l
    JOIN "Commande" c ON c.id = l."commandeId"
    WHERE c."atelierId" = ANY(${ids}) AND l."annuleAt" IS NULL
    GROUP BY c.id HAVING COUNT(*) > 1`;
  for (const r of livraisonsMultiples) v.push(`I3 commande ${r.numero} : ${r.n} livraisons actives`);

  const livreeSansLivraison = await prisma.$queryRaw`
    SELECT c.numero FROM "Commande" c
    WHERE c."atelierId" = ANY(${ids}) AND c.statut = 'LIVREE'
      AND NOT EXISTS (SELECT 1 FROM "Livraison" l WHERE l."commandeId" = c.id AND l."annuleAt" IS NULL)`;
  for (const r of livreeSansLivraison) v.push(`I4 commande ${r.numero} : LIVREE sans livraison active`);

  const livraisonSansStatut = await prisma.$queryRaw`
    SELECT c.numero, c.statut::text AS statut FROM "Commande" c
    WHERE c."atelierId" = ANY(${ids}) AND c.statut <> 'LIVREE'
      AND EXISTS (SELECT 1 FROM "Livraison" l WHERE l."commandeId" = c.id AND l."annuleAt" IS NULL)`;
  for (const r of livraisonSansStatut) v.push(`I4 commande ${r.numero} : livraison active mais statut ${r.statut}`);

  const recuSurPaiementAnnule = await prisma.$queryRaw`
    SELECT r.numero FROM "Recu" r
    JOIN "Paiement" p ON p.id = r."paiementId"
    JOIN "Commande" c ON c.id = r."commandeId"
    WHERE c."atelierId" = ANY(${ids}) AND p."annuleAt" IS NOT NULL`;
  for (const r of recuSurPaiementAnnule) v.push(`I5 reçu ${r.numero} : référence un paiement annulé`);

  const recuTropGros = await prisma.$queryRaw`
    SELECT r.numero, r."montantPaye"::text AS paye, c."prixTotal"::text AS prix FROM "Recu" r
    JOIN "Commande" c ON c.id = r."commandeId"
    WHERE c."atelierId" = ANY(${ids}) AND r."montantPaye" > c."prixTotal"`;
  for (const r of recuTropGros) v.push(`I6 reçu ${r.numero} : montant ${r.paye} > prix ${r.prix}`);

  // I8 : un événement PAIEMENT_ENREGISTRE par paiement créé (annulés compris : l'événement
  // est figé à la création), un COMMANDE_CREEE par commande.
  const ecartsPaiements = await prisma.$queryRaw`
    SELECT c.numero,
      (SELECT COUNT(*)::int FROM "Paiement" p WHERE p."commandeId" = c.id) AS paiements,
      (SELECT COUNT(*)::int FROM "NotificationClient" n WHERE n."commandeId" = c.id AND n.type = 'PAIEMENT_ENREGISTRE') AS evenements
    FROM "Commande" c WHERE c."atelierId" = ANY(${ids})`;
  for (const r of ecartsPaiements) {
    if (r.paiements !== r.evenements) v.push(`I8 commande ${r.numero} : ${r.paiements} paiements mais ${r.evenements} événements`);
  }
  const ecartsCreation = await prisma.$queryRaw`
    SELECT c.numero,
      (SELECT COUNT(*)::int FROM "NotificationClient" n WHERE n."commandeId" = c.id AND n.type = 'COMMANDE_CREEE') AS evenements
    FROM "Commande" c WHERE c."atelierId" = ANY(${ids}) AND c.numero NOT LIKE 'TEST-%'`;
  for (const r of ecartsCreation) {
    if (r.evenements !== 1) v.push(`I8 commande ${r.numero} : ${r.evenements} événements COMMANDE_CREEE (1 attendu)`);
  }
  return v;
}

/** I7 : aucune quantité négative, pour les articles des ateliers donnés. */
export async function violationsStock(atelierIds) {
  const ids = Array.isArray(atelierIds) ? atelierIds : [atelierIds];
  const rows = await prisma.$queryRaw`
    SELECT a.nom,
      COALESCE(SUM(CASE WHEN m.type = 'ENTREE' THEN m.quantite ELSE -m.quantite END), 0)::text AS quantite
    FROM "ArticleStock" a LEFT JOIN "MouvementStock" m ON m."articleId" = a.id
    WHERE a."atelierId" = ANY(${ids})
    GROUP BY a.id HAVING COALESCE(SUM(CASE WHEN m.type = 'ENTREE' THEN m.quantite ELSE -m.quantite END), 0) < 0`;
  return rows.map((r) => `I7 article ${r.nom} : quantité ${r.quantite} < 0`);
}

/** Toutes les violations d'un coup. */
export async function toutesViolations(atelierIds) {
  return [...(await violationsFinancieres(atelierIds)), ...(await violationsStock(atelierIds))];
}

/** Lance `n` appels simultanés de `fn(i)` et renvoie les résultats dans l'ordre. */
export function enParallele(n, fn) {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
}

/** Compte les statuts HTTP d'une liste de réponses : { 201: 3, 409: 7 }. */
export function repartition(reponses) {
  const out = {};
  for (const r of reponses) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}
