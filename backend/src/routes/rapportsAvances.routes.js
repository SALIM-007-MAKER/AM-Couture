import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requirePermission } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { resolvePeriod, dateRangeWhere } from "../lib/period.js";
import { periodQuerySchema } from "../schemas/dashboard.schema.js";
import { STATUTS_OUVERTS, debutDuJour } from "../lib/production.js";

// Rapports avancés (6.7) — PUREMENT consultatifs, montés sous /api/rapports/avances par rapports.routes.js (donc derrière
// l'authentification, l'appartenance à l'atelier, l'abonnement et « rapports.lire »).
//
// Permission DISTINCTE « rapports.avances » : voir la performance des employés n'est pas anodin. Les rapports qui portent un
// montant (achats, dépenses, marges) exigent EN PLUS « finances.voir », comme les rapports financiers existants.
//
// Toutes les requêtes sont bornées à l'atelier de la personne connectée. Les paramètres SQL sont toujours liés (Prisma.sql).
const router = Router();

const D0 = new Prisma.Decimal(0);
const dec = (v) => (v == null ? D0 : new Prisma.Decimal(v));
const nombre = (v) => Number(v ?? 0);
const peutAvances = requirePermission("rapports.avances");
const peutAvancesEtMontants = [peutAvances, requirePermission("finances.voir")];

function lirePeriode(req) {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  return { from, to, range: dateRangeWhere(from, to), periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null };
}

// Fragment SQL « colonne dans la période » (bornes facultatives).
function sqlPeriode(colonne, from, to) {
  const morceaux = [];
  if (from) morceaux.push(Prisma.sql`AND ${colonne} >= ${from}`);
  if (to) morceaux.push(Prisma.sql`AND ${colonne} < ${to}`);
  return morceaux.length ? Prisma.join(morceaux, " ") : Prisma.empty;
}

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/avances/production?period=|from=&to=
// Par employé : commandes ouvertes qui lui sont confiées, dont en retard (instantané du jour), et livraisons de la période
// (dont à l'heure). Les commandes sont attribuées à l'employé auquel elles sont confiées AUJOURD'HUI (l'historique des
// affectations n'est pas rejoué). Aucun montant.
// ───────────────────────────────────────────────────────────────────────
router.get("/production", peutAvances, async (req, res) => {
  const { from, to, periode } = lirePeriode(req);
  const { atelierId } = req.user;
  const debut = debutDuJour();

  const [ouvertes, enRetard, nonAffectees, nonAffecteesRetard, livraisons, employes] = await Promise.all([
    prisma.commande.groupBy({ by: ["assigneAId"], where: { atelierId, statut: { in: STATUTS_OUVERTS }, assigneAId: { not: null } }, _count: true }),
    prisma.commande.groupBy({ by: ["assigneAId"], where: { atelierId, statut: { in: STATUTS_OUVERTS }, assigneAId: { not: null }, dateLivraisonPrevue: { lt: debut } }, _count: true }),
    prisma.commande.count({ where: { atelierId, statut: { in: STATUTS_OUVERTS }, assigneAId: null } }),
    prisma.commande.count({ where: { atelierId, statut: { in: STATUTS_OUVERTS }, assigneAId: null, dateLivraisonPrevue: { lt: debut } } }),
    prisma.$queryRaw`
      SELECT c."assigneAId" AS id,
             COUNT(*) AS livrees,
             COUNT(*) FILTER (WHERE l."dateLivraison"::date <= c."dateLivraisonPrevue"::date) AS a_lheure
      FROM "Livraison" l
      JOIN "Commande" c ON c.id = l."commandeId"
      WHERE c."atelierId" = ${atelierId} AND l."annuleAt" IS NULL AND c."assigneAId" IS NOT NULL
      ${sqlPeriode(Prisma.sql`l."dateLivraison"`, from, to)}
      GROUP BY c."assigneAId"`,
    prisma.user.findMany({ where: { atelierId, role: "EMPLOYE" }, select: { id: true, prenom: true, nom: true, identifiant: true, actif: true } }),
  ]);

  const parId = new Map();
  const ligne = (id) => {
    if (!parId.has(id)) parId.set(id, { id, ouvertes: 0, enRetard: 0, livrees: 0, livreesALHeure: 0 });
    return parId.get(id);
  };
  for (const g of ouvertes) ligne(g.assigneAId).ouvertes = g._count;
  for (const g of enRetard) ligne(g.assigneAId).enRetard = g._count;
  for (const l of livraisons) {
    const x = ligne(l.id);
    x.livrees = nombre(l.livrees);
    x.livreesALHeure = nombre(l.a_lheure);
  }
  const infos = new Map(employes.map((e) => [e.id, e]));
  // Une personne qui n'est plus employée de cet atelier (ou le PDG) peut encore avoir des commandes confiées : on la nomme.
  const inconnus = [...parId.keys()].filter((id) => !infos.has(id));
  if (inconnus.length) {
    for (const u of await prisma.user.findMany({ where: { id: { in: inconnus }, atelierId }, select: { id: true, prenom: true, nom: true, identifiant: true, actif: true } })) infos.set(u.id, u);
  }
  for (const e of employes.filter((e) => e.actif)) ligne(e.id); // les employés actifs apparaissent même sans activité

  const lignes = [...parId.values()]
    .filter((l) => infos.has(l.id))
    .map((l) => ({
      ...l,
      prenom: infos.get(l.id).prenom,
      nom: infos.get(l.id).nom,
      identifiant: infos.get(l.id).identifiant,
      actif: infos.get(l.id).actif,
      tauxALHeure: l.livrees > 0 ? Math.round((l.livreesALHeure / l.livrees) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.ouvertes - a.ouvertes || (a.identifiant ?? "").localeCompare(b.identifiant ?? ""));

  res.json({ periode, employes: lignes, nonAffectees: { ouvertes: nonAffectees, enRetard: nonAffecteesRetard } });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/avances/retards?period=|from=&to=
// Retards : instantané des commandes ouvertes en retard (par statut, par priorité, les plus anciennes) + ponctualité des
// livraisons de la période (à l'heure / en retard, retard moyen). Définition du retard : celle de la production (jour UTC).
// ───────────────────────────────────────────────────────────────────────
router.get("/retards", peutAvances, async (req, res) => {
  const { from, to, periode } = lirePeriode(req);
  const { atelierId } = req.user;
  const debut = debutDuJour();
  const ouvertesEnRetard = { atelierId, statut: { in: STATUTS_OUVERTS }, dateLivraisonPrevue: { lt: debut } };

  const [total, parStatut, parPriorite, anciennes, ponctualite] = await Promise.all([
    prisma.commande.count({ where: ouvertesEnRetard }),
    prisma.commande.groupBy({ by: ["statut"], where: ouvertesEnRetard, _count: true }),
    prisma.commande.groupBy({ by: ["priorite"], where: ouvertesEnRetard, _count: true }),
    prisma.commande.findMany({
      where: ouvertesEnRetard,
      orderBy: [{ dateLivraisonPrevue: "asc" }, { id: "asc" }],
      take: 20,
      select: { id: true, numero: true, statut: true, priorite: true, dateLivraisonPrevue: true, cliente: { select: { id: true, prenom: true, nom: true } }, assigneA: { select: { id: true, prenom: true, nom: true, identifiant: true } } },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*) AS livrees,
             COUNT(*) FILTER (WHERE l."dateLivraison"::date <= c."dateLivraisonPrevue"::date) AS a_lheure,
             AVG((l."dateLivraison"::date - c."dateLivraisonPrevue"::date)) FILTER (WHERE l."dateLivraison"::date > c."dateLivraisonPrevue"::date) AS retard_moyen
      FROM "Livraison" l JOIN "Commande" c ON c.id = l."commandeId"
      WHERE c."atelierId" = ${atelierId} AND l."annuleAt" IS NULL
      ${sqlPeriode(Prisma.sql`l."dateLivraison"`, from, to)}`,
  ]);

  const msJour = 86_400_000;
  const [p] = ponctualite;
  const livrees = nombre(p?.livrees);
  const aLHeure = nombre(p?.a_lheure);
  res.json({
    periode,
    enCours: {
      total,
      parStatut: parStatut.map((g) => ({ statut: g.statut, nombre: g._count })),
      parPriorite: parPriorite.map((g) => ({ priorite: g.priorite, nombre: g._count })),
      plusAnciennes: anciennes.map((c) => ({ ...c, joursDeRetard: Math.floor((debut.getTime() - new Date(c.dateLivraisonPrevue).getTime()) / msJour) })),
    },
    ponctualite: {
      livrees,
      aLHeure,
      enRetard: livrees - aLHeure,
      tauxALHeure: livrees > 0 ? Math.round((aLHeure / livrees) * 1000) / 10 : null,
      retardMoyenJours: p?.retard_moyen == null ? null : Math.round(Number(p.retard_moyen) * 10) / 10,
    },
  });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/avances/achats-fournisseurs?period=|from=&to=   (+ « finances.voir »)
// Par fournisseur : achats (hors annulés), valeur commandée, valeur reçue, valeur des achats payés. Période sur la date de
// commande de l'achat. Les achats annulés sont comptés à part et ne pèsent dans aucune valeur.
// ───────────────────────────────────────────────────────────────────────
router.get("/achats-fournisseurs", peutAvancesEtMontants, async (req, res) => {
  const { from, to, periode } = lirePeriode(req);
  const { atelierId } = req.user;
  const lignes = await prisma.$queryRaw`
    WITH t AS (
      SELECT a.id, a."fournisseurId", a.statut, (a."depenseId" IS NOT NULL) AS paye,
             COALESCE(SUM(l.quantite * l."prixUnitaire"), 0) AS commande,
             COALESCE(SUM(l."quantiteRecue" * l."prixUnitaire"), 0) AS recu
      FROM "Achat" a LEFT JOIN "LigneAchat" l ON l."achatId" = a.id
      WHERE a."atelierId" = ${atelierId} ${sqlPeriode(Prisma.sql`a."dateCommande"`, from, to)}
      GROUP BY a.id
    )
    SELECT f.id AS "fournisseurId", f.nom,
           COUNT(*) FILTER (WHERE t.statut = 'COMMANDE') AS achats,
           COUNT(*) FILTER (WHERE t.statut = 'ANNULE') AS annules,
           COALESCE(SUM(t.commande) FILTER (WHERE t.statut = 'COMMANDE'), 0) AS commande,
           COALESCE(SUM(t.recu) FILTER (WHERE t.statut = 'COMMANDE'), 0) AS recu,
           COALESCE(SUM(t.commande) FILTER (WHERE t.statut = 'COMMANDE' AND t.paye), 0) AS paye
    FROM t JOIN "Fournisseur" f ON f.id = t."fournisseurId" AND f."atelierId" = ${atelierId}
    GROUP BY f.id, f.nom
    ORDER BY commande DESC, f.nom ASC`;

  const fournisseurs = lignes.map((l) => ({
    fournisseurId: l.fournisseurId,
    nom: l.nom,
    nombreAchats: nombre(l.achats),
    nombreAnnules: nombre(l.annules),
    valeurCommandee: dec(l.commande),
    valeurRecue: dec(l.recu),
    valeurPayee: dec(l.paye),
    resteAPayer: dec(l.commande).minus(dec(l.paye)),
  }));
  const somme = (cle) => fournisseurs.reduce((s, f) => s.plus(f[cle]), D0);
  res.json({
    periode,
    fournisseurs,
    total: { nombreAchats: fournisseurs.reduce((s, f) => s + f.nombreAchats, 0), valeurCommandee: somme("valeurCommandee"), valeurRecue: somme("valeurRecue"), valeurPayee: somme("valeurPayee"), resteAPayer: somme("resteAPayer") },
  });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/avances/depenses-categories?period=|from=&to=   (+ « finances.voir »)
// Dépenses (non annulées) par catégorie, avec la part de chacune. `dontAchats` : la partie qui vient du paiement d'un achat
// fournisseur (une même dépense n'est jamais comptée deux fois : ce n'est qu'une décomposition).
// ───────────────────────────────────────────────────────────────────────
router.get("/depenses-categories", peutAvancesEtMontants, async (req, res) => {
  const { range, periode } = lirePeriode(req);
  const { atelierId } = req.user;
  const base = { atelierId, annuleAt: null, ...(range ? { date: range } : {}) };
  const [parCategorie, parCategorieAchats] = await Promise.all([
    prisma.depense.groupBy({ by: ["categorie"], where: base, _sum: { montant: true }, _count: true }),
    prisma.depense.groupBy({ by: ["categorie"], where: { ...base, achat: { isNot: null } }, _sum: { montant: true } }),
  ]);
  const achats = new Map(parCategorieAchats.map((g) => [g.categorie, dec(g._sum.montant)]));
  const total = parCategorie.reduce((s, g) => s.plus(dec(g._sum.montant)), D0);
  const categories = parCategorie
    .map((g) => ({
      categorie: g.categorie,
      nombre: g._count,
      total: dec(g._sum.montant),
      dontAchats: achats.get(g.categorie) ?? D0,
      part: total.isZero() ? null : dec(g._sum.montant).div(total).times(100).toDecimalPlaces(1),
    }))
    .sort((a, b) => b.total.comparedTo(a.total) || a.categorie.localeCompare(b.categorie));
  res.json({ periode, categories, total, nombre: parCategorie.reduce((s, g) => s + g._count, 0) });
});

// ───────────────────────────────────────────────────────────────────────
// GET /api/rapports/avances/marges?period=|from=&to=   (+ « finances.voir »)
// Marge SIMPLE de la période : valeur des commandes passées (hors annulées) moins les dépenses de la période. C'est un ordre
// de grandeur, pas une marge comptable : les dépenses ne sont pas rattachées commande par commande (loyer, salaires, tissu
// acheté d'avance…), et une commande peut être payée dans une autre période. `soldeCaisse` = encaissé − dépenses.
// ───────────────────────────────────────────────────────────────────────
router.get("/marges", peutAvancesEtMontants, async (req, res) => {
  const { range, periode } = lirePeriode(req);
  const { atelierId } = req.user;
  const commandes = { atelierId, statut: { not: "ANNULEE" }, ...(range ? { dateCommande: range } : {}) };
  const [ca, parType, encaisse, depenses] = await Promise.all([
    prisma.commande.aggregate({ where: commandes, _sum: { prixTotal: true }, _count: true }),
    prisma.commande.groupBy({ by: ["typeVetement"], where: commandes, _sum: { prixTotal: true }, _count: true }),
    prisma.paiement.aggregate({ where: { annuleAt: null, commande: { atelierId }, ...(range ? { date: range } : {}) }, _sum: { montant: true } }),
    prisma.depense.aggregate({ where: { atelierId, annuleAt: null, ...(range ? { date: range } : {}) }, _sum: { montant: true } }),
  ]);
  const chiffre = dec(ca._sum.prixTotal);
  const sorties = dec(depenses._sum.montant);
  const marge = chiffre.minus(sorties);
  res.json({
    periode,
    valeurCommandes: chiffre,
    nombreCommandes: ca._count,
    totalDepenses: sorties,
    margeSimple: marge,
    tauxMarge: chiffre.isZero() ? null : marge.div(chiffre).times(100).toDecimalPlaces(1),
    soldeCaisse: dec(encaisse._sum.montant).minus(sorties),
    parType: parType
      .map((g) => ({ typeVetement: g.typeVetement, nombre: g._count, valeur: dec(g._sum.prixTotal) }))
      .sort((a, b) => b.valeur.comparedTo(a.valeur) || a.typeVetement.localeCompare(b.typeVetement)),
    avertissement: "Ordre de grandeur : les dépenses ne sont pas rattachées commande par commande.",
  });
});

export default router;
