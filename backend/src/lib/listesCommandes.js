// Listes « commandes en retard » et « commandes à livrer », partagées par /api/rapports (permission rapports.lire) et
// /api/dashboard (permission dashboard.lire + commandes.lire). UNE seule implémentation : mêmes requêtes, même format de
// réponse. Les routes ne gardent que la validation des paramètres et la garde de permission.
import { prisma } from "./prisma.js";

// LIVREE et ANNULEE sont les deux seuls statuts sans transition sortante (STATUT_TRANSITIONS, commande.schema.js) :
// ce sont les deux seuls états « clos » du workflow.
const COMMANDES_NON_TERMINALES = { notIn: ["LIVREE", "ANNULEE"] };

const COMMANDE_LISTE_SELECT = {
  id: true,
  numero: true,
  statut: true,
  priorite: true,
  dateLivraisonPrevue: true,
  prixTotal: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
};

const meta = (page, pageSize, total) => ({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });

/**
 * §9 : dateLivraisonPrevue dépassée ET statut non terminal. Une commande LIVREE ou ANNULEE n'apparaît jamais ici, quelle
 * que soit sa date historique. Les plus en retard d'abord.
 */
export async function listerCommandesEnRetard(atelierId, { page, pageSize }) {
  const now = new Date();
  const where = { atelierId, statut: COMMANDES_NON_TERMINALES, dateLivraisonPrevue: { lt: now } };
  const [rows, total] = await Promise.all([
    prisma.commande.findMany({
      where,
      orderBy: [{ dateLivraisonPrevue: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: COMMANDE_LISTE_SELECT,
    }),
    prisma.commande.count({ where }),
  ]);
  const data = rows.map((c) => ({
    ...c,
    joursDeRetard: Math.floor((now.getTime() - c.dateLivraisonPrevue.getTime()) / 86_400_000),
  }));
  return { data, meta: meta(page, pageSize, total) };
}

/**
 * §1/§8 : dateLivraisonPrevue dans [maintenant, maintenant+horizonJours[, statut non terminal. Borne basse = maintenant
 * (pas le début de journée) : aucun chevauchement possible avec « en retard » (dateLivraisonPrevue < now).
 */
export async function listerCommandesALivrer(atelierId, { horizonJours, page, pageSize }) {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonJours * 86_400_000);
  const where = { atelierId, statut: COMMANDES_NON_TERMINALES, dateLivraisonPrevue: { gte: now, lt: horizon } };
  const [data, total] = await Promise.all([
    prisma.commande.findMany({
      where,
      orderBy: [{ dateLivraisonPrevue: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: COMMANDE_LISTE_SELECT,
    }),
    prisma.commande.count({ where }),
  ]);
  return { horizonJours, data, meta: meta(page, pageSize, total) };
}
