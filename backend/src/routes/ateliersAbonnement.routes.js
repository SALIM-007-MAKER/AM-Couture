import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { nextNumero } from "../lib/numero.js";
import { activerAbonnementSchema, modifierAbonnementSchema, noteSchema } from "../schemas/abonnement.schema.js";
import { calculerDateExpiration, etatAbonnementAtelier, statutEffectif, prixPourDuree } from "../lib/abonnement.js";

// Gestion MANUELLE de l'abonnement d'un atelier par le SUPERADMIN (§
// abonnement sans paiement en ligne). Monté sous /api/ateliers — chemins
// /:atelierId/abonnement... — AVANT ateliers.routes.js (voir app.js).
// Cette activation est la SEULE façon d'activer un abonnement aujourd'hui :
// aucun endpoint côté ADMIN, aucune confirmation déduite du frontend.
const router = Router();
router.use(requireAuth, requireSuperadmin);
router.param("atelierId", requireValidIdParam);
router.param("abonnementId", requireValidIdParam);

const ABONNEMENT_SELECT = {
  id: true,
  atelierId: true,
  numero: true,
  statut: true,
  planId: true,
  planNom: true,
  dureeMois: true,
  prix: true,
  dateDebut: true,
  dateExpiration: true,
  creePar: true,
  createdAt: true,
};

function serialiser(a) {
  return { ...a, statutEffectif: statutEffectif(a) };
}

async function chargerAtelier(atelierId) {
  const atelier = await prisma.atelier.findUnique({
    where: { id: atelierId },
    select: { id: true, nom: true, trialEndsAt: true },
  });
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");
  return atelier;
}

async function chargerAbonnement(atelierId, abonnementId) {
  const abonnement = await prisma.abonnement.findFirst({ where: { id: abonnementId, atelierId } });
  if (!abonnement) throw new HttpError(404, "Abonnement introuvable.");
  return abonnement;
}

async function chargerPlanActif(planId) {
  const plan = await prisma.planAbonnement.findUnique({ where: { id: planId } });
  if (!plan || !plan.actif) throw new HttpError(404, "Plan introuvable ou désactivé.");
  return plan;
}

function ecrireHistorique(tx, { abonnement, action, req, note }) {
  return tx.historiqueAbonnement.create({
    data: {
      atelierId: abonnement.atelierId,
      abonnementId: abonnement.id,
      action,
      planNom: abonnement.planNom,
      dureeMois: abonnement.dureeMois,
      dateDebut: abonnement.dateDebut,
      dateExpiration: abonnement.dateExpiration,
      par: req.user.identifiant,
      note,
    },
  });
}

function dureeEntre(debut, fin) {
  const mois = (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12 + (fin.getUTCMonth() - debut.getUTCMonth());
  return Math.max(1, mois);
}

// GET /api/ateliers/:atelierId/abonnement — état courant, abonnements et
// historique complet des changements.
router.get("/:atelierId/abonnement", async (req, res) => {
  const atelier = await chargerAtelier(req.params.atelierId);
  const [abonnements, historique] = await Promise.all([
    prisma.abonnement.findMany({
      where: { atelierId: atelier.id },
      select: ABONNEMENT_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.historiqueAbonnement.findMany({
      where: { atelierId: atelier.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const etat = etatAbonnementAtelier(atelier, abonnements);
  res.json({
    atelier: { id: atelier.id, nom: atelier.nom },
    statut: etat.statut,
    essai: etat.essai,
    abonnementCourant: etat.abonnement ? serialiser(etat.abonnement) : null,
    abonnements: abonnements.map(serialiser),
    historique,
  });
});

// POST /api/ateliers/:atelierId/abonnement/activer — crée un abonnement
// CONFIRME pour cet atelier. dateDebut par défaut = maintenant ; une date de
// début future donne un abonnement "En attente d'activation" jusqu'à cette
// date. Le prix est figé à l'activation : prix mensuel × durée, avec la remise
// de la durée si elle fait partie des durées proposées du plan (prixPourDuree).
router.post("/:atelierId/abonnement/activer", async (req, res) => {
  const parsed = activerAbonnementSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { planId, note } = parsed.data;
  const atelier = await chargerAtelier(req.params.atelierId);
  const plan = await chargerPlanActif(planId);

  const dateDebut = parsed.data.dateDebut ?? new Date();
  const dateExpiration = parsed.data.dateExpiration ?? calculerDateExpiration(dateDebut, parsed.data.dureeMois);
  if (dateExpiration <= dateDebut) {
    throw new HttpError(400, "Champs invalides.", {
      dateExpiration: ["La date d'expiration doit être postérieure à la date de début."],
    });
  }
  const dureeMois = parsed.data.dureeMois ?? dureeEntre(dateDebut, dateExpiration);

  const abonnement = await prisma.$transaction(
    async (tx) => {
      const cree = await tx.abonnement.create({
        data: {
          numero: await nextNumero(tx, "ABN"),
          atelierId: atelier.id,
          planId: plan.id,
          planNom: plan.nom,
          dureeMois,
          prix: prixPourDuree(plan, dureeMois),
          statut: "CONFIRME",
          dateDebut,
          dateExpiration,
          creePar: req.user.identifiant,
        },
        select: ABONNEMENT_SELECT,
      });
      await ecrireHistorique(tx, { abonnement: cree, action: "ACTIVATION", req, note });
      return cree;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(serialiser(abonnement));
});

// PATCH /api/ateliers/:atelierId/abonnement/:abonnementId — corrige le plan
// et/ou les dates d'un abonnement CONFIRME (ex: prolonger, décaler le début).
router.patch("/:atelierId/abonnement/:abonnementId", async (req, res) => {
  const parsed = modifierAbonnementSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const abonnement = await chargerAbonnement(req.params.atelierId, req.params.abonnementId);
  if (abonnement.statut !== "CONFIRME") throw new HttpError(409, "Seul un abonnement activé peut être modifié.");

  const data = {};
  if (parsed.data.planId) {
    const plan = await chargerPlanActif(parsed.data.planId);
    data.planId = plan.id;
    data.planNom = plan.nom;
  }
  if (parsed.data.dateDebut) data.dateDebut = parsed.data.dateDebut;
  if (parsed.data.dateExpiration) data.dateExpiration = parsed.data.dateExpiration;
  const debut = data.dateDebut ?? abonnement.dateDebut;
  const fin = data.dateExpiration ?? abonnement.dateExpiration;
  if (debut && fin && fin <= debut) {
    throw new HttpError(400, "Champs invalides.", {
      dateExpiration: ["La date d'expiration doit être postérieure à la date de début."],
    });
  }

  const maj = await prisma.$transaction(async (tx) => {
    const m = await tx.abonnement.update({ where: { id: abonnement.id }, data, select: ABONNEMENT_SELECT });
    await ecrireHistorique(tx, { abonnement: m, action: "MODIFICATION", req, note: parsed.data.note });
    return m;
  });
  res.json(serialiser(maj));
});

// POST .../:abonnementId/expirer — met fin à l'abonnement MAINTENANT (la date
// d'expiration passe à l'instant présent) : statut effectif "Expiré".
router.post("/:atelierId/abonnement/:abonnementId/expirer", async (req, res) => {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const abonnement = await chargerAbonnement(req.params.atelierId, req.params.abonnementId);
  if (abonnement.statut !== "CONFIRME") throw new HttpError(409, "Seul un abonnement activé peut expirer.");
  if (statutEffectif(abonnement) === "EXPIRE") throw new HttpError(409, "Cet abonnement est déjà expiré.");

  const maintenant = new Date();
  const maj = await prisma.$transaction(async (tx) => {
    const m = await tx.abonnement.update({
      where: { id: abonnement.id },
      // Un abonnement planifié (début futur) qu'on expire ne doit pas
      // garder un début postérieur à sa fin.
      data: { dateExpiration: maintenant, ...(abonnement.dateDebut > maintenant ? { dateDebut: maintenant } : {}) },
      select: ABONNEMENT_SELECT,
    });
    await ecrireHistorique(tx, { abonnement: m, action: "EXPIRATION", req, note: parsed.data.note });
    return m;
  });
  res.json(serialiser(maj));
});

// POST .../:abonnementId/desactiver — annule l'abonnement (statut ANNULE),
// quelle que soit sa date : il n'ouvre plus aucun accès.
router.post("/:atelierId/abonnement/:abonnementId/desactiver", async (req, res) => {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const abonnement = await chargerAbonnement(req.params.atelierId, req.params.abonnementId);
  if (abonnement.statut === "ANNULE") throw new HttpError(409, "Cet abonnement est déjà désactivé.");

  const maj = await prisma.$transaction(async (tx) => {
    const m = await tx.abonnement.update({
      where: { id: abonnement.id },
      data: { statut: "ANNULE" },
      select: ABONNEMENT_SELECT,
    });
    await ecrireHistorique(tx, { abonnement: m, action: "DESACTIVATION", req, note: parsed.data.note });
    return m;
  });
  res.json(serialiser(maj));
});

export default router;
