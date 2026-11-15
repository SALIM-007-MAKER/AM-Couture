import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { contactSchema, journalSecuriteQuerySchema } from "../schemas/plateforme.schema.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { journaliserSecurite } from "../lib/securityLog.js";
import { log, messageErreur } from "../lib/logger.js";
import { confirmerTransaction, rejeterTransaction, rembourserTransaction } from "../lib/souscription.js";
import { paiementWaveActif, rembourserSession, ErreurWave } from "../lib/wave.js";
import { streamFacturePdf } from "../lib/facturePdf.js";
import { origineApplication } from "../lib/appUrl.js";
import { notifierDecision } from "../lib/notificationsAbonnement.js";
import {
  confirmerSchema,
  motifSchema,
  listTransactionsQuerySchema,
  parametresAbonnementSchema,
} from "../schemas/abonnementPaiement.schema.js";

// Réglages globaux de la plateforme — SUPERADMIN uniquement (le PDG ne reçoit
// le contact qu'en lecture, via GET /api/abonnements/etat).
const router = Router();
router.use(requireAuth, requireSuperadmin);
router.param("id", requireValidIdParam);

router.get("/contact", async (req, res) => {
  const p = await prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" } });
  res.json({ whatsapp: p?.contactWhatsapp ?? null });
});

router.put("/contact", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const p = await prisma.parametresPlateforme.upsert({
    where: { id: "plateforme" },
    create: { id: "plateforme", contactWhatsapp: parsed.data.whatsapp },
    update: { contactWhatsapp: parsed.data.whatsapp },
  });
  res.json({ whatsapp: p.contactWhatsapp });
});

// GET /api/plateforme/journal-securite?evenement=&atelierId=&userId=&page=&pageSize=
// — consultation (lecture seule) du journal de sécurité persistant, plus récent
// d'abord. Réservé SUPERADMIN (router.use ci-dessus).
router.get("/journal-securite", async (req, res) => {
  const parsed = journalSecuriteQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { evenement, atelierId, userId, page, pageSize } = parsed.data;
  const where = {
    ...(evenement ? { evenement } : {}),
    ...(atelierId ? { atelierId } : {}),
    ...(userId ? { userId } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.journalSecurite.count({ where }),
    prisma.journalSecurite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({ items, total, page, pageSize });
});

// ── Paiements d'abonnement ────────────────────────────────────────────────
// Le SUPERADMIN rapproche la déclaration d'un atelier de son relevé (mobile money, banque, caisse) puis confirme ou
// rejette. Toute décision est signée, datée, journalisée ; rejouer une décision déjà prise ne refait rien.
const TRANSACTION_ADMIN_SELECT = {
  id: true,
  numero: true,
  atelierId: true,
  statut: true,
  moyenPaiement: true,
  operateur: true,
  montant: true,
  referenceExterne: true,
  preuveNote: true,
  declarePar: true,
  declareLe: true,
  confirmePar: true,
  confirmeLe: true,
  motifRejet: true,
  rembourseLe: true,
  rembourseePar: true,
  motifRemboursement: true,
  createdAt: true,
  abonnement: {
    select: { id: true, numero: true, planNom: true, dureeMois: true, statut: true, dateDebut: true, dateExpiration: true },
  },
  facture: { select: { id: true, numero: true, annuleeLe: true } },
};

// GET /api/plateforme/transactions?statut=&atelierId=&page=&pageSize= — plus récentes d'abord.
router.get("/transactions", async (req, res) => {
  const parsed = listTransactionsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { statut, atelierId, page, pageSize } = parsed.data;
  const where = { ...(statut ? { statut } : {}), ...(atelierId ? { atelierId } : {}) };
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: TRANSACTION_ADMIN_SELECT,
    }),
  ]);
  const ateliers = await prisma.atelier.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.atelierId).filter(Boolean))] } },
    select: { id: true, nom: true },
  });
  const nomParId = new Map(ateliers.map((a) => [a.id, a.nom]));
  const data = rows.map((r) => ({ ...r, atelierNom: nomParId.get(r.atelierId) ?? null }));
  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

async function decision(req, res, { evenement, appliquer, corps, avant }) {
  const parsed = corps.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  if (avant) await avant();
  const resultat = await prisma.$transaction((tx) => appliquer(tx, parsed.data), { maxWait: 10_000, timeout: 15_000 });
  if (!resultat.deja) {
    await journaliserSecurite(evenement, {
      req,
      userId: req.user.id,
      atelierId: resultat.transaction.atelierId,
      details: { prefixe: resultat.transaction.numero },
    });
    log.info("abonnement", {
      evenement: evenement.toLowerCase(),
      transaction: resultat.transaction.numero,
      par: req.user.identifiant,
    });
    // L'atelier est prévenu par courriel ; un échec d'envoi n'annule jamais la décision (déjà enregistrée).
    await notifierDecision({
      prisma,
      evenement,
      transactionId: resultat.transaction.id,
      origine: origineApplication(req),
    }).catch((err) => log.warn("abonnement", { evenement: "notification_decision_echec", message: messageErreur(err) }));
  }
  const t = await prisma.transaction.findUnique({ where: { id: req.params.id }, select: TRANSACTION_ADMIN_SELECT });
  res.json({ ...t, dejaTraitee: resultat.deja });
}

// POST /api/plateforme/transactions/:id/confirmer — active l'abonnement et émet la facture. Répétable sans effet.
router.post("/transactions/:id/confirmer", (req, res) =>
  decision(req, res, {
    evenement: "ABONNEMENT_PAIEMENT_CONFIRME",
    corps: confirmerSchema,
    appliquer: async (tx, { note }) => {
      const t = await tx.transaction.findUnique({ where: { id: req.params.id }, select: { atelierId: true } });
      if (!t) throw new HttpError(404, "Transaction introuvable.");
      const atelier = await tx.atelier.findUnique({ where: { id: t.atelierId }, select: { nom: true } });
      return confirmerTransaction(tx, {
        transactionId: req.params.id,
        par: req.user.identifiant,
        note,
        atelierNom: atelier?.nom ?? "—",
      });
    },
  }),
);

// POST /api/plateforme/transactions/:id/rejeter { motif } — paiement introuvable ou invalide.
router.post("/transactions/:id/rejeter", (req, res) =>
  decision(req, res, {
    evenement: "ABONNEMENT_PAIEMENT_REJETE",
    corps: motifSchema,
    appliquer: (tx, { motif }) =>
      rejeterTransaction(tx, { transactionId: req.params.id, par: req.user.identifiant, motif }),
  }),
);

// POST /api/plateforme/transactions/:id/rembourser { motif } — enregistre un remboursement total (l'argent est rendu
// hors plateforme pour un paiement manuel). La facture est marquée annulée, l'abonnement cesse.
router.post("/transactions/:id/rembourser", (req, res) =>
  decision(req, res, {
    evenement: "ABONNEMENT_PAIEMENT_REMBOURSE",
    corps: motifSchema,
    avant: async () => {
      // Paiement Wave : l'argent est d'abord rendu PAR Wave (opération idempotente chez eux). Si Wave refuse ou ne
      // répond pas, rien n'est enregistré ici : on ne déclare jamais remboursé un paiement qui ne l'est pas.
      const t = await prisma.transaction.findUnique({ where: { id: req.params.id }, select: { moyenPaiement: true, statut: true, referenceExterne: true } });
      if (!t || t.moyenPaiement !== "WAVE" || t.statut !== "REUSSIE") return;
      if (!paiementWaveActif()) {
        throw new HttpError(409, "Wave n'est pas activé : impossible de rembourser ce paiement depuis la plateforme.");
      }
      try {
        await rembourserSession(t.referenceExterne);
      } catch (err) {
        if (err instanceof ErreurWave) throw new HttpError(502, "Wave n'a pas effectué le remboursement. Rien n'a été enregistré.", { wave: err.message });
        throw err;
      }
    },
    appliquer: (tx, { motif }) =>
      rembourserTransaction(tx, { transactionId: req.params.id, par: req.user.identifiant, motif }),
  }),
);

// GET /api/plateforme/factures/:id/pdf
router.get("/factures/:id/pdf", async (req, res) => {
  const facture = await prisma.factureAbonnement.findUnique({ where: { id: req.params.id } });
  if (!facture) throw new HttpError(404, "Facture introuvable.");
  streamFacturePdf(res, { facture });
});

// GET/PUT /api/plateforme/parametres-abonnement — jours de grâce avant la lecture seule (0 à 90).
router.get("/parametres-abonnement", async (req, res) => {
  const p = await prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" } });
  res.json({ joursGrace: p?.joursGrace ?? 7, instructionsPaiement: p?.instructionsPaiement ?? null });
});

router.put("/parametres-abonnement", async (req, res) => {
  const parsed = parametresAbonnementSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const donnees = {
    ...(parsed.data.joursGrace !== undefined ? { joursGrace: parsed.data.joursGrace } : {}),
    ...(parsed.data.instructionsPaiement !== undefined ? { instructionsPaiement: parsed.data.instructionsPaiement } : {}),
  };
  const p = await prisma.parametresPlateforme.upsert({
    where: { id: "plateforme" },
    create: { id: "plateforme", ...donnees },
    update: donnees,
  });
  res.json({ joursGrace: p.joursGrace, instructionsPaiement: p.instructionsPaiement });
});

export default router;
