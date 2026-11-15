import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { etatAbonnementAtelier, statutEffectif, joursRestants, modeAcces } from "../lib/abonnement.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { idempotence } from "../lib/idempotence.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { journaliserSecurite } from "../lib/securityLog.js";
import { log, messageErreur } from "../lib/logger.js";
import { souscrire, annulerParAtelier } from "../lib/souscription.js";
import { streamFacturePdf } from "../lib/facturePdf.js";
import { origineApplication } from "../lib/appUrl.js";
import { notifierDeclaration } from "../lib/notificationsAbonnement.js";
import { souscrireSchema } from "../schemas/abonnementPaiement.schema.js";

const router = Router();
// L'abonnement est celui DE L'ATELIER (Phase 8). LECTURE SEULE : un ADMIN ne
// peut ni souscrire ni activer quoi que ce soit — l'activation est une action
// exclusive du SUPERADMIN (voir ateliersAbonnement.routes.js), et aucun
// paiement en ligne n'existe encore (lib/payments/ est dormant).
router.use(requireAuth, requireAtelier);
router.param("id", requireValidIdParam);

const JOURS_GRACE_PAR_DEFAUT = 7;

const ABONNEMENT_SELECT = {
  id: true,
  numero: true,
  statut: true,
  planNom: true,
  dureeMois: true,
  prix: true,
  dateDebut: true,
  dateExpiration: true,
  plan: { select: { id: true, nom: true } },
};

// Vue d'une transaction pour l'atelier : jamais la référence interne ni les données brutes d'un prestataire.
const TRANSACTION_SELECT = {
  id: true,
  numero: true,
  statut: true,
  moyenPaiement: true,
  operateur: true,
  montant: true,
  referenceExterne: true,
  declareLe: true,
  confirmeLe: true,
  motifRejet: true,
  createdAt: true,
  abonnement: { select: { planNom: true, dureeMois: true, dateDebut: true, dateExpiration: true } },
  facture: { select: { id: true, numero: true, emisLe: true, annuleeLe: true } },
};

// GET /api/abonnements/etat — l'état à afficher sur la page Abonnement du PDG :
// ACTIF | EN_ATTENTE | ESSAI | EXPIRE | AUCUN, avec le plan et les dates de
// l'abonnement concerné et l'essai gratuit. Recalculé à chaque lecture depuis
// la base (le frontend interroge régulièrement) : tout changement fait par le
// SUPERADMIN est visible sans rechargement de page.
router.get("/etat", async (req, res) => {
  const [atelier, abonnements, plateforme, enAttente] = await Promise.all([
    prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: { trialEndsAt: true } }),
    prisma.abonnement.findMany({ where: { atelierId: req.user.atelierId }, select: ABONNEMENT_SELECT }),
    prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" } }),
    prisma.transaction.findFirst({
      where: { atelierId: req.user.atelierId, statut: "EN_ATTENTE" },
      select: TRANSACTION_SELECT,
    }),
  ]);
  const etat = etatAbonnementAtelier(atelier ?? { trialEndsAt: null }, abonnements);
  const a = etat.abonnement;
  res.json({
    statut: etat.statut,
    essai: etat.essai,
    // Contact WhatsApp de l'administrateur (réglé par le SUPERADMIN) — null si non configuré.
    contact: { whatsapp: plateforme?.contactWhatsapp ?? null },
    // Accès actuel : COMPLET, GRACE (bandeau, tout fonctionne encore) ou LECTURE_SEULE.
    acces: modeAcces(etat, abonnements, { joursGrace: plateforme?.joursGrace ?? JOURS_GRACE_PAR_DEFAUT }),
    // Déclaration de paiement en attente de confirmation par la plateforme, s'il y en a une.
    paiementEnAttente: enAttente,
    abonnement: a && {
      planNom: a.planNom ?? a.plan?.nom ?? null,
      dureeMois: a.dureeMois,
      prix: a.prix,
      dateDebut: a.dateDebut,
      dateExpiration: a.dateExpiration,
      statutEffectif: statutEffectif(a),
      joursRestants: a.dateExpiration && etat.statut === "ACTIF" ? joursRestants(a.dateExpiration) : null,
    },
  });
});

// POST /api/abonnements/souscrire — l'atelier choisit une formule et DÉCLARE un paiement fait hors plateforme.
// Le prix est calculé par le serveur d'après la formule et la durée : rien de ce qui est envoyé ne fixe un montant.
// Cette route ne donne aucun accès : l'abonnement n'est activé que lorsque la plateforme confirme le paiement.
router.post("/souscrire", idempotence, async (req, res) => {
  const parsed = souscrireSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { planId, ...declaration } = parsed.data;

  const [atelier, plan] = await Promise.all([
    prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: { id: true, nom: true } }),
    prisma.planAbonnement.findUnique({ where: { id: planId } }),
  ]);
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");
  if (!plan || !plan.actif) throw new HttpError(404, "Formule introuvable ou désactivée.");

  const { transaction } = await prisma.$transaction(
    (tx) => souscrire(tx, { atelier, plan, ...declaration, par: req.user.identifiant }),
    { maxWait: 10_000, timeout: 15_000 },
  );
  await journaliserSecurite("ABONNEMENT_PAIEMENT_DECLARE", {
    req,
    userId: req.user.id,
    atelierId: atelier.id,
    details: { prefixe: transaction.numero },
  });
  log.info("abonnement", { evenement: "paiement_declare", transaction: transaction.numero, atelierId: atelier.id });
  // La plateforme est prévenue par courriel (si une adresse est configurée) ; un échec n'annule pas la déclaration.
  await notifierDeclaration({ prisma, transaction, atelierNom: atelier.nom, origine: origineApplication(req) }).catch((err) =>
    log.warn("abonnement", { evenement: "notification_declaration_echec", message: messageErreur(err) }),
  );
  res.status(201).json({ id: transaction.id, numero: transaction.numero, statut: transaction.statut, montant: transaction.montant });
});

// GET /api/abonnements/transactions — historique des paiements de l'atelier (déclarés, confirmés, rejetés, remboursés).
router.get("/transactions", async (req, res) => {
  const data = await prisma.transaction.findMany({
    where: { atelierId: req.user.atelierId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: TRANSACTION_SELECT,
  });
  res.json({ data });
});

// POST /api/abonnements/transactions/:id/annuler — l'atelier retire sa déclaration tant qu'elle n'est pas traitée.
router.post("/transactions/:id/annuler", async (req, res) => {
  const { transaction, deja } = await prisma.$transaction((tx) =>
    annulerParAtelier(tx, { transactionId: req.params.id, atelierId: req.user.atelierId, par: req.user.identifiant }),
  );
  if (!deja) {
    await journaliserSecurite("ABONNEMENT_PAIEMENT_ANNULE", {
      req,
      userId: req.user.id,
      atelierId: req.user.atelierId,
      details: { prefixe: transaction.numero },
    });
  }
  res.json({ id: transaction.id, numero: transaction.numero, statut: transaction.statut });
});

// GET /api/abonnements/factures/:id/pdf — justificatif de paiement de l'atelier (404 s'il appartient à un autre).
router.get("/factures/:id/pdf", async (req, res) => {
  const facture = await prisma.factureAbonnement.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!facture) throw new HttpError(404, "Facture introuvable.");
  streamFacturePdf(res, { facture });
});

export default router;
