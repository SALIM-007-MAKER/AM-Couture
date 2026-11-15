import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import {
  bilanAteliers,
  bilanConversion,
  moisDeLaFenetre,
  renouvellementsASuivre,
  revenuMensuelRecurrent,
  serieRevenus,
  tauxRenouvellement,
  totauxRevenus,
} from "../lib/commerce.js";

// Tableau de bord commercial — SUPERADMIN uniquement. Lecture seule. Les définitions de chaque indicateur sont en
// tête de lib/commerce.js et dans docs/PHASE5-ANALYSE.md ; les montants sont renvoyés sous forme de chaînes.
const router = Router();
router.use(requireAuth, requireSuperadmin);

const JOURS_GRACE_PAR_DEFAUT = 7;

/** Tous les ateliers avec ce qu'il faut pour calculer leur état d'abonnement, et si un paiement est en attente. */
async function chargerAteliers() {
  const [ateliers, enAttente, parametres] = await Promise.all([
    prisma.atelier.findMany({
      select: {
        id: true,
        nom: true,
        actif: true,
        createdAt: true,
        trialEndsAt: true,
        telephone: true,
        users: { where: { role: "ADMIN", email: { not: null } }, take: 1, orderBy: { createdAt: "asc" }, select: { email: true } },
        abonnements: {
          where: { statut: { in: ["CONFIRME", "SUSPENDU"] } },
          select: { statut: true, planNom: true, dureeMois: true, prix: true, dateDebut: true, dateExpiration: true },
        },
      },
    }),
    prisma.transaction.findMany({ where: { statut: "EN_ATTENTE" }, select: { atelierId: true } }),
    prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" }, select: { joursGrace: true } }),
  ]);
  const avecPaiement = new Set(enAttente.map((t) => t.atelierId));
  return {
    joursGrace: parametres?.joursGrace ?? JOURS_GRACE_PAR_DEFAUT,
    ateliers: ateliers.map(({ users, ...a }) => ({ ...a, emailContact: users[0]?.email ?? null, paiementEnAttente: avecPaiement.has(a.id) })),
  };
}

// Même écriture des montants partout (« 27000 », « 10000.5 »), quelle que soit leur origine (Decimal Prisma ou texte SQL).
const montant = (valeur) => new Prisma.Decimal(valeur ?? 0).toString();

const debutDeFenetre = (nombreMois, now) => {
  const [annee, mois] = moisDeLaFenetre(nombreMois, now)[0].split("-").map(Number);
  return new Date(Date.UTC(annee, mois - 1, 1));
};
// Bornes passées en texte puis converties : les colonnes sont des « timestamp » sans fuseau (UTC), la comparaison
// ne doit dépendre d'aucun fuseau de session.
const enTimestamp = (date) => date.toISOString();

// Les requêtes brutes ci-dessous n'interpolent AUCUNE valeur venant de l'appelant : colonnes et statuts sont des
// constantes du code, les bornes de dates sont passées en paramètres liés.
async function lignesMensuelles(statuts, colonneDate, debut, atelierId = null) {
  const lignes = await prisma.$queryRawUnsafe(
    `SELECT to_char(date_trunc('month', "${colonneDate}"), 'YYYY-MM') AS mois, SUM("montant")::text AS total, COUNT(*)::int AS nombre
       FROM "Transaction"
      WHERE "statut"::text = ANY($1::text[]) AND "${colonneDate}" >= $2::timestamp AND ($3::text IS NULL OR "atelierId" = $3::text)
      GROUP BY 1`,
    statuts,
    enTimestamp(debut),
    atelierId,
  );
  return lignes;
}

async function revenusSur(nombreMois, now, atelierId = null) {
  const debut = debutDeFenetre(nombreMois, now);
  const [encaissements, remboursements] = await Promise.all([
    lignesMensuelles(["REUSSIE", "REMBOURSEE"], "confirmeLe", debut, atelierId),
    lignesMensuelles(["REMBOURSEE"], "rembourseLe", debut, atelierId),
  ]);
  return { debut, serie: serieRevenus(encaissements, remboursements, nombreMois, now) };
}

// GET /api/plateforme/commerce/synthese — vue d'ensemble : ateliers par état et par mode d'accès, revenus du mois,
// revenu mensuel récurrent, paiements à vérifier, conversion des essais, renouvellements.
router.get("/synthese", async (req, res) => {
  const now = new Date();
  const { ateliers, joursGrace } = await chargerAteliers();
  const [{ serie }, cumul, enAttente, wave] = await Promise.all([
    revenusSur(2, now),
    prisma.$queryRaw`
      SELECT COALESCE(SUM("montant"), 0)::text AS encaisse,
             COALESCE(SUM("montant") FILTER (WHERE "statut" = 'REMBOURSEE'), 0)::text AS rembourse
        FROM "Transaction" WHERE "statut" IN ('REUSSIE', 'REMBOURSEE')`,
    prisma.transaction.aggregate({ where: { statut: "EN_ATTENTE" }, _count: true, _sum: { montant: true }, _min: { createdAt: true } }),
    prisma.transaction.findMany({
      where: { statut: "EN_ATTENTE", moyenPaiement: "WAVE" },
      select: { numero: true, atelierId: true, donneesBrutesWebhook: true },
    }),
  ]);

  const tousAbonnements = ateliers.flatMap((a) => a.abonnements);
  const [moisPrecedent, moisCourant] = serie;
  const totalEncaisse = new Prisma.Decimal(cumul[0]?.encaisse ?? 0);
  const totalRembourse = new Prisma.Decimal(cumul[0]?.rembourse ?? 0);

  res.json({
    genereLe: now.toISOString(),
    joursGrace,
    ateliers: { ...bilanAteliers(ateliers, { joursGrace }, now), nouveaux30Jours: ateliers.filter((a) => now - a.createdAt <= 30 * 86_400_000).length },
    revenus: {
      moisCourant,
      moisPrecedent,
      cumul: { encaisse: totalEncaisse.toString(), rembourse: totalRembourse.toString(), net: totalEncaisse.minus(totalRembourse).toString() },
      revenuMensuelRecurrent: revenuMensuelRecurrent(tousAbonnements, now).toString(),
    },
    paiementsAVerifier: {
      nombre: enAttente._count,
      montant: montant(enAttente._sum.montant),
      plusAncienLe: enAttente._min.createdAt,
    },
    // Paiements Wave abouti chez Wave mais refusés par la vérification (montant, référence...) : à traiter à la main.
    anomaliesWave: wave
      .filter((t) => t.donneesBrutesWebhook?.incoherence)
      .map((t) => ({ transaction: t.numero, atelierId: t.atelierId, raison: t.donneesBrutesWebhook.incoherence })),
    conversion: bilanConversion(ateliers, { periodeJours: 90 }, now),
    renouvellement: tauxRenouvellement(ateliers, { periodeJours: 90, joursGrace }, now),
  });
});

const revenusQuery = z.object({
  mois: z.coerce.number().int().min(1).max(36).optional().default(12),
  atelierId: z.string().trim().min(1).max(60).optional(),
});

// GET /api/plateforme/commerce/revenus?mois=12[&atelierId=] — série mensuelle (encaissé, remboursé, net) et ventilation par formule
// et par moyen de paiement, sur la fenêtre. Les ventilations sont datées du jour de confirmation du paiement.
router.get("/revenus", async (req, res) => {
  const parsed = revenusQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const now = new Date();
  const { mois, atelierId = null } = parsed.data;
  const { debut, serie } = await revenusSur(mois, now, atelierId);

  const ventilation = async (cle) =>
    (await prisma.$queryRawUnsafe(
      `SELECT ${cle} AS cle, SUM(t."montant")::text AS encaisse,
              COALESCE(SUM(t."montant") FILTER (WHERE t."statut" = 'REMBOURSEE'), 0)::text AS rembourse,
              COUNT(*)::int AS nombre
         FROM "Transaction" t JOIN "Abonnement" a ON a.id = t."abonnementId"
        WHERE t."statut" IN ('REUSSIE', 'REMBOURSEE') AND t."confirmeLe" >= $1::timestamp AND ($2::text IS NULL OR t."atelierId" = $2::text)
        GROUP BY 1 ORDER BY SUM(t."montant") DESC`,
      enTimestamp(debut),
      atelierId,
    )).map((l) => ({ ...l, encaisse: montant(l.encaisse), rembourse: montant(l.rembourse) }));
  const [parPlan, parMoyen, manuelles] = await Promise.all([
    ventilation(`COALESCE(a."planNom", 'Sans formule')`),
    ventilation(`t."moyenPaiement"::text`),
    prisma.abonnement.aggregate({
      where: { statut: "CONFIRME", createdAt: { gte: debut }, transactions: { none: {} }, ...(atelierId ? { atelierId } : {}) },
      _count: true,
      _sum: { prix: true },
    }),
  ]);

  res.json({
    mois,
    atelierId,
    depuis: debut.toISOString().slice(0, 10),
    serie,
    totaux: totauxRevenus(serie),
    parPlan,
    parMoyen,
    // Abonnements activés à la main sans aucun paiement enregistré (cadeaux, paiements reçus hors plateforme) :
    // leur valeur n'est PAS comptée dans les revenus ci-dessus faute de justificatif de paiement.
    activationsSansPaiementEnregistre: { nombre: manuelles._count, valeur: montant(manuelles._sum.prix) },
  });
});

const renouvellementsQuery = z.object({ jours: z.coerce.number().int().min(1).max(180).optional().default(30) });

// GET /api/plateforme/commerce/renouvellements?jours=30 — ateliers à relancer : échéance dans l'horizon, abonnement
// récemment expiré non repris, essai qui se termine. `paiementEnAttente` : l'atelier a déjà déclaré un paiement.
router.get("/renouvellements", async (req, res) => {
  const parsed = renouvellementsQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const now = new Date();
  const { ateliers, joursGrace } = await chargerAteliers();
  res.json({
    horizonJours: parsed.data.jours,
    ...renouvellementsASuivre(ateliers, { horizonJours: parsed.data.jours, joursGrace }, now),
    tauxRenouvellement: tauxRenouvellement(ateliers, { periodeJours: 90, joursGrace }, now),
  });
});

export default router;
