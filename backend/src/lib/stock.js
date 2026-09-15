import { Prisma } from "../generated/prisma/client.ts";

const D0 = new Prisma.Decimal(0);
const dec = (v) => (v == null ? D0 : new Prisma.Decimal(v));

/**
 * Quantité en stock d'UN article — TOUJOURS dérivée de
 * SUM(mouvements ENTREE) - SUM(mouvements SORTIE), jamais stockée (même
 * principe que Commande.solde, dérivé des Paiements — voir
 * paiements.routes.js). Accepte `prisma` ou un client de transaction (`tx`),
 * même interface.
 */
export async function quantiteArticle(prisma, articleId) {
  const [entrees, sorties] = await Promise.all([
    prisma.mouvementStock.aggregate({ where: { articleId, type: "ENTREE" }, _sum: { quantite: true } }),
    prisma.mouvementStock.aggregate({ where: { articleId, type: "SORTIE" }, _sum: { quantite: true } }),
  ]);
  return dec(entrees._sum.quantite).minus(dec(sorties._sum.quantite));
}

/**
 * Quantités de PLUSIEURS articles en une seule requête groupée (liste) —
 * évite un aggregate par ligne (N+1). Retourne une Map<articleId, Decimal>.
 */
export async function quantitesArticles(prisma, articleIds) {
  const out = new Map(articleIds.map((id) => [id, D0]));
  if (articleIds.length === 0) return out;

  const rows = await prisma.mouvementStock.groupBy({
    by: ["articleId", "type"],
    where: { articleId: { in: articleIds } },
    _sum: { quantite: true },
  });

  const totaux = new Map(articleIds.map((id) => [id, { ENTREE: D0, SORTIE: D0 }]));
  for (const r of rows) {
    totaux.get(r.articleId)[r.type] = dec(r._sum.quantite);
  }
  for (const [id, { ENTREE, SORTIE }] of totaux) {
    out.set(id, ENTREE.minus(SORTIE));
  }
  return out;
}
