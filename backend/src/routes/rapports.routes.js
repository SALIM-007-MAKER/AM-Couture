import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import {
  resolvePeriod,
  dateRangeWhere,
  previousPeriodBounds,
  variationPct,
  defaultEvolutionRange,
  monthsInRange,
  monthKey,
  MAX_EVOLUTION_MONTHS,
} from "../lib/period.js";
import {
  periodQuerySchema,
  evolutionQuerySchema,
  enRetardQuerySchema,
  aLivrerQuerySchema,
} from "../schemas/dashboard.schema.js";
import { STATUTS_COMMANDE, PRIORITES } from "../schemas/commande.schema.js";
import { CATEGORIES_VETEMENT } from "../schemas/modele.schema.js";

// Module PUREMENT consultatif : aucune écriture en base dans ce fichier.
const router = Router();
router.use(requireAuth, requireAtelier, requireAbonnementActif);

const D0 = new Prisma.Decimal(0);
const dec = (v) => (v == null ? D0 : new Prisma.Decimal(v));
const COMMANDES_NON_TERMINALES = { notIn: ["LIVREE", "ANNULEE"] };

// Agrégats finances pour UNE plage donnée — factorisé pour être appelé deux
// fois par GET /finances (période demandée + période précédente, § stats
// comparatives) sans dupliquer les 3 requêtes.
async function agregatsFinances(atelierId, range) {
  const [commandesAgg, paiementsAgg, depensesAgg] = await Promise.all([
    prisma.commande.aggregate({
      where: { atelierId, ...(range ? { dateCommande: range } : {}) },
      _count: true,
      _sum: { prixTotal: true },
    }),
    prisma.paiement.aggregate({
      where: { annuleAt: null, commande: { atelierId }, ...(range ? { date: range } : {}) },
      _count: true,
      _sum: { montant: true },
    }),
    prisma.depense.aggregate({
      where: { atelierId, annuleAt: null, ...(range ? { date: range } : {}) },
      _count: true,
      _sum: { montant: true },
    }),
  ]);

  const totalCommandes = dec(commandesAgg._sum.prixTotal);
  const totalEncaisse = dec(paiementsAgg._sum.montant);
  const totalDepenses = dec(depensesAgg._sum.montant);

  return {
    totalCommandes,
    nombreCommandes: commandesAgg._count,
    totalEncaisse,
    nombrePaiements: paiementsAgg._count,
    totalDepenses,
    nombreDepenses: depensesAgg._count,
    solde: totalEncaisse.minus(totalDepenses),
  };
}

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/finances?period=|from=&to=
// §6 : total commandes (valeur), total encaissé, total dépenses, solde,
// nombre de paiements, nombre de dépenses.
// ───────────────────────────────────────────────────────────────────────
router.get("/finances", async (req, res) => {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  const range = dateRangeWhere(from, to);
  const { atelierId } = req.user;

  const actuel = await agregatsFinances(atelierId, range);

  // Comparaison à la période précédente de MÊME DURÉE (§ stats comparatives)
  // — calculable uniquement pour une période bornée des deux côtés (un
  // préréglage, ou une plage personnalisée from+to complète) ; `null` sinon
  // (portée globale, ou "depuis"/"jusqu'à" seul — voir previousPeriodBounds).
  const bornesPrecedentes = previousPeriodBounds(from, to);
  const comparaison = bornesPrecedentes
    ? await (async () => {
        const precedent = await agregatsFinances(atelierId, dateRangeWhere(bornesPrecedentes.from, bornesPrecedentes.to));
        return {
          periode: { from: bornesPrecedentes.from.toISOString(), to: bornesPrecedentes.to.toISOString() },
          totalCommandes: precedent.totalCommandes.toString(),
          nombreCommandes: precedent.nombreCommandes,
          totalEncaisse: precedent.totalEncaisse.toString(),
          nombrePaiements: precedent.nombrePaiements,
          totalDepenses: precedent.totalDepenses.toString(),
          nombreDepenses: precedent.nombreDepenses,
          solde: precedent.solde.toString(),
          variation: {
            totalCommandes: variationPct(actuel.totalCommandes, precedent.totalCommandes),
            totalEncaisse: variationPct(actuel.totalEncaisse, precedent.totalEncaisse),
            totalDepenses: variationPct(actuel.totalDepenses, precedent.totalDepenses),
            solde: variationPct(actuel.solde, precedent.solde),
          },
        };
      })()
    : null;

  res.json({
    periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null,
    // Attention : totalCommandes (commandes CRÉÉES pendant la période) et
    // totalEncaisse (paiements REÇUS pendant la période) ne portent pas
    // nécessairement sur le même ensemble de commandes — un paiement de
    // cette période peut régler une commande créée avant elle, et
    // inversement une commande de cette période peut n'être payée que plus
    // tard. C'est un rapport "par activité de la période", pas un
    // rapprochement facture-par-facture.
    totalCommandes: actuel.totalCommandes.toString(),
    nombreCommandes: actuel.nombreCommandes,
    totalEncaisse: actuel.totalEncaisse.toString(),
    nombrePaiements: actuel.nombrePaiements,
    totalDepenses: actuel.totalDepenses.toString(),
    nombreDepenses: actuel.nombreDepenses,
    // Voir dashboard.routes.js : "résultat de trésorerie", pas un bénéfice
    // comptable (aucune donnée de coût de revient dans le schéma actuel).
    solde: actuel.solde.toString(),
    comparaison,
  });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/evolution?from=&to=
// §7 : évolution mensuelle (commandes, ventes, encaissements, dépenses,
// résultat). Toutes les sommes/comptages sont calculés par PostgreSQL
// (agrégation SQL groupée par mois via date_trunc), jamais en chargeant les
// lignes en mémoire. Défaut : 12 derniers mois glissants si from/to omis.
// Plafonné à MAX_EVOLUTION_MONTHS (60) mois quelle que soit la plage
// demandée, pour éviter une réponse illimitée (§14).
// ───────────────────────────────────────────────────────────────────────
router.get("/evolution", async (req, res) => {
  const parsed = evolutionQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));

  let { from, to } = parsed.data;
  if (!from && !to) {
    ({ from, to } = defaultEvolutionRange());
  } else {
    // from/to partiels : complète avec la borne par défaut correspondante
    // plutôt que de traiter "from seul" comme une plage infinie.
    const defaults = defaultEvolutionRange();
    from = from ?? defaults.from;
    to = to ?? defaults.to;
  }

  const months = monthsInRange(from, to);
  if (months.length === 0) {
    throw new HttpError(400, "Plage invalide.", { to: ["La date de fin doit être postérieure à la date de début."] });
  }
  if (months.length > MAX_EVOLUTION_MONTHS) {
    throw new HttpError(400, `Plage trop large : ${MAX_EVOLUTION_MONTHS} mois maximum.`, {
      _global: [`${months.length} mois demandés, maximum ${MAX_EVOLUTION_MONTHS}.`],
    });
  }

  const { atelierId } = req.user;

  // Paiement n'a pas de colonne atelierId propre (scopé via Commande) — JOIN
  // nécessaire ici, contrairement à Commande/Depense qui ont directement la
  // colonne (Phase 8 — multi-tenant).
  const [commandesParMois, paiementsParMois, depensesParMois] = await Promise.all([
    prisma.$queryRaw`
      SELECT to_char(date_trunc('month', "dateCommande"), 'YYYY-MM') AS mois,
             COUNT(*)::int AS nombre,
             COALESCE(SUM("prixTotal"), 0)::text AS montant
      FROM "Commande"
      WHERE "dateCommande" >= ${from} AND "dateCommande" < ${to} AND "atelierId" = ${atelierId}
      GROUP BY 1
    `,
    prisma.$queryRaw`
      SELECT to_char(date_trunc('month', p."date"), 'YYYY-MM') AS mois,
             COUNT(*)::int AS nombre,
             COALESCE(SUM(p."montant"), 0)::text AS montant
      FROM "Paiement" p
      JOIN "Commande" c ON c.id = p."commandeId"
      WHERE p."date" >= ${from} AND p."date" < ${to} AND p."annuleAt" IS NULL AND c."atelierId" = ${atelierId}
      GROUP BY 1
    `,
    prisma.$queryRaw`
      SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS mois,
             COUNT(*)::int AS nombre,
             COALESCE(SUM("montant"), 0)::text AS montant
      FROM "Depense"
      WHERE "date" >= ${from} AND "date" < ${to} AND "annuleAt" IS NULL AND "atelierId" = ${atelierId}
      GROUP BY 1
    `,
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [r.mois, r]));
  const cmdMap = toMap(commandesParMois);
  const paiMap = toMap(paiementsParMois);
  const depMap = toMap(depensesParMois);

  // Chaque mois de la plage apparaît, même sans aucune activité (valeurs à
  // zéro) — indispensable pour une série temporelle exploitable côté
  // frontend (pas de "trou" silencieux dans le graphe).
  const data = months.map((d) => {
    const key = monthKey(d);
    const cmd = cmdMap.get(key);
    const pai = paiMap.get(key);
    const dep = depMap.get(key);
    const ventes = dec(cmd?.montant);
    const encaissements = dec(pai?.montant);
    const depenses = dec(dep?.montant);
    return {
      mois: key,
      commandes: cmd?.nombre ?? 0,
      ventes: ventes.toString(),
      encaissements: encaissements.toString(),
      depenses: depenses.toString(),
      resultat: encaissements.minus(depenses).toString(),
    };
  });

  res.json({ periode: { from: from.toISOString(), to: to.toISOString() }, data });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/commandes?period=|from=&to=
// §8 : répartition par statut/priorité/catégorie + activité de la période.
// parStatut/parPriorite/parCategorie sont filtrés par la période si
// from/to fournis, sinon portée globale (répartition actuelle complète du
// portefeuille) — cohérent avec "creees" qui, lui, est TOUJOURS scopé (0
// commande créée hors période s'il n'y en a pas).
// ───────────────────────────────────────────────────────────────────────
router.get("/commandes", async (req, res) => {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  const range = dateRangeWhere(from, to);
  const where = { atelierId: req.user.atelierId, ...(range ? { dateCommande: range } : {}) };

  const [creeesAgg, parStatutRaw, parPrioriteRaw, parCategorieRaw] = await Promise.all([
    prisma.commande.aggregate({ where, _count: true, _sum: { prixTotal: true } }),
    prisma.commande.groupBy({ by: ["statut"], where, _count: true }),
    prisma.commande.groupBy({ by: ["priorite"], where, _count: true }),
    prisma.commande.groupBy({ by: ["typeVetement"], where, _count: true }),
  ]);

  // Complète avec les valeurs de l'enum absentes du résultat (0 commande) —
  // réponse de forme stable, jamais un tableau qui "disparaît" une
  // catégorie simplement parce qu'elle est à zéro sur la période.
  const fill = (rows, values, key, field) => {
    const map = new Map(rows.map((r) => [r[field], r._count]));
    return values.map((v) => ({ [key]: v, nombre: map.get(v) ?? 0 }));
  };

  res.json({
    periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null,
    creees: { nombre: creeesAgg._count, valeurTotale: dec(creeesAgg._sum.prixTotal).toString() },
    parStatut: fill(parStatutRaw, STATUTS_COMMANDE, "statut", "statut"),
    parPriorite: fill(parPrioriteRaw, PRIORITES, "priorite", "priorite"),
    parCategorie: fill(parCategorieRaw, CATEGORIES_VETEMENT, "categorie", "typeVetement"),
  });
});

const COMMANDE_LISTE_SELECT = {
  id: true,
  numero: true,
  statut: true,
  priorite: true,
  dateLivraisonPrevue: true,
  prixTotal: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
};

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/commandes/en-retard?page=&pageSize=
// §9 : dateLivraisonPrevue dépassée ET statut non terminal. Une commande
// LIVREE ou ANNULEE n'apparaît jamais ici, quelle que soit sa date
// historique — logique déduite de STATUT_TRANSITIONS (commande.schema.js) :
// LIVREE/ANNULEE sont les deux seuls statuts sans transition sortante, donc
// les deux seuls états "clos" du workflow réel.
// ───────────────────────────────────────────────────────────────────────
router.get("/commandes/en-retard", async (req, res) => {
  const parsed = enRetardQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { page, pageSize } = parsed.data;
  const now = new Date();

  const where = {
    atelierId: req.user.atelierId,
    statut: COMMANDES_NON_TERMINALES,
    dateLivraisonPrevue: { lt: now },
  };
  const [rows, total] = await Promise.all([
    prisma.commande.findMany({
      where,
      orderBy: [{ dateLivraisonPrevue: "asc" }, { id: "asc" }], // les plus en retard d'abord
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

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/commandes/a-livrer?horizonJours=&page=&pageSize=
// §1/§8 : dateLivraisonPrevue dans [maintenant, maintenant+horizonJours[,
// statut non terminal. Borne basse = maintenant (pas le début de journée) :
// aucun chevauchement possible avec /en-retard (dateLivraisonPrevue < now).
// ───────────────────────────────────────────────────────────────────────
router.get("/commandes/a-livrer", async (req, res) => {
  const parsed = aLivrerQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { horizonJours, page, pageSize } = parsed.data;
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonJours * 86_400_000);

  const where = {
    atelierId: req.user.atelierId,
    statut: COMMANDES_NON_TERMINALES,
    dateLivraisonPrevue: { gte: now, lt: horizon },
  };
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

  res.json({
    horizonJours,
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/clientes?period=|from=&to=
// §11 : actives/archivées (état actuel), nouvelles/ayant commandé (activité
// de la période), top clientes par nombre de commandes.
// ───────────────────────────────────────────────────────────────────────
router.get("/clientes", async (req, res) => {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  const range = dateRangeWhere(from, to);
  const { atelierId } = req.user;

  const [actives, archivees, nouvelles, ayantCommandeRows, topGroup] = await Promise.all([
    prisma.cliente.count({ where: { atelierId, archivedAt: null } }),
    prisma.cliente.count({ where: { atelierId, archivedAt: { not: null } } }),
    prisma.cliente.count({ where: { atelierId, ...(range ? { createdAt: range } : {}) } }),
    range
      ? prisma.$queryRaw`
          SELECT COUNT(DISTINCT "clienteId")::int AS count
          FROM "Commande"
          WHERE "dateCommande" >= ${from} AND "dateCommande" < ${to} AND "atelierId" = ${atelierId}
        `
      : prisma.$queryRaw`SELECT COUNT(DISTINCT "clienteId")::int AS count FROM "Commande" WHERE "atelierId" = ${atelierId}`,
    prisma.commande.groupBy({
      by: ["clienteId"],
      where: { atelierId, ...(range ? { dateCommande: range } : {}) },
      _count: true,
      orderBy: { _count: { clienteId: "desc" } },
      take: 10,
    }),
  ]);

  const topClientesInfo = await prisma.cliente.findMany({
    where: { id: { in: topGroup.map((g) => g.clienteId) }, atelierId },
    select: { id: true, nom: true, prenom: true },
  });
  const infoMap = new Map(topClientesInfo.map((c) => [c.id, c]));
  const topClientes = topGroup.map((g) => ({ ...infoMap.get(g.clienteId), nombreCommandes: g._count }));

  res.json({
    periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null,
    actives,
    archivees,
    nouvelles,
    ayantCommande: ayantCommandeRows[0].count,
    topClientes,
  });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/modeles?period=|from=&to=
// §12 : actifs/archivés + répartition par catégorie (état actuel du
// catalogue, indépendant de la période — un catalogue n'a pas de notion de
// "modèle créé pendant la période" pertinente pour ce rapport), modèles les
// plus utilisés dans les commandes (scopé par la période si fournie).
// ───────────────────────────────────────────────────────────────────────
router.get("/modeles", async (req, res) => {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  const range = dateRangeWhere(from, to);
  const { atelierId } = req.user;

  const [actifs, archives, parCategorieRaw, topGroup] = await Promise.all([
    prisma.modele.count({ where: { atelierId, archivedAt: null } }),
    prisma.modele.count({ where: { atelierId, archivedAt: { not: null } } }),
    prisma.modele.groupBy({ by: ["categorie"], where: { atelierId, archivedAt: null }, _count: true }),
    prisma.commande.groupBy({
      by: ["modeleId"],
      where: { atelierId, modeleId: { not: null }, ...(range ? { dateCommande: range } : {}) },
      _count: true,
      orderBy: { _count: { modeleId: "desc" } },
      take: 10,
    }),
  ]);

  const catMap = new Map(parCategorieRaw.map((r) => [r.categorie, r._count]));
  const parCategorie = CATEGORIES_VETEMENT.map((c) => ({ categorie: c, nombre: catMap.get(c) ?? 0 }));

  const topModelesInfo = await prisma.modele.findMany({
    where: { id: { in: topGroup.map((g) => g.modeleId) }, atelierId },
    select: { id: true, nom: true, categorie: true, archivedAt: true },
  });
  const infoMap = new Map(topModelesInfo.map((m) => [m.id, m]));
  const plusUtilises = topGroup.map((g) => ({ ...infoMap.get(g.modeleId), nombreCommandes: g._count }));

  res.json({
    periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null,
    actifs,
    archives,
    parCategorie,
    plusUtilises,
  });
});

export default router;
