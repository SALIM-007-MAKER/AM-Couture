import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { computeSolde } from "../lib/money.js";
import { nextNumero } from "../lib/numero.js";
import { isUniqueConstraintViolation } from "../lib/prismaErrors.js";
import { RECU_INCLUDE } from "../lib/recuInclude.js";
import {
  createPaiementSchema,
  listPaiementsQuerySchema,
  listPaiementsGlobalQuerySchema,
} from "../schemas/paiement.schema.js";
import { createRecuSchema } from "../schemas/recu.schema.js";
import { annulerSchema } from "../schemas/annulation.schema.js";

// mergeParams: true — monté sous /api/commandes/:commandeId/paiements, a
// besoin de req.params.commandeId. requireAuth est déjà appliqué par le
// routeur parent (commandes.routes.js) avant le montage : rien à refaire ici.
const router = Router({ mergeParams: true });

router.param("paiementId", requireValidIdParam);

// POST /api/commandes/:commandeId/paiements — création (protégée contre la concurrence)
router.post("/", async (req, res) => {
  const parsed = createPaiementSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;
  const { commandeId } = req.params;
  const montantDecimal = new Prisma.Decimal(data.montant);

  const paiement = await prisma.$transaction(
    async (tx) => {
      // Verrouille la ligne Commande (SELECT ... FOR UPDATE) pour toute la
      // durée de la transaction : sérialise les créations de paiement
      // concurrentes sur LA MÊME commande. Sans ce verrou, deux requêtes
      // simultanées pourraient lire le même solde disponible et être
      // acceptées toutes les deux, faisant dépasser prixTotal (voir tests de
      // concurrence). Isolation READ COMMITTED (défaut Postgres) suffit ici :
      // la 2ᵉ transaction ne reprend qu'après le COMMIT de la 1ʳᵉ et relit
      // alors un état à jour — pas besoin de SERIALIZABLE ni de retry.
      const locked = await tx.$queryRaw`SELECT id FROM "Commande" WHERE id = ${commandeId} FOR UPDATE`;
      if (locked.length === 0) {
        throw new HttpError(404, "Commande introuvable.");
      }

      const commande = await tx.commande.findUnique({ where: { id: commandeId } });
      if (!commande) throw new HttpError(404, "Commande introuvable.");

      if (commande.statut === "ANNULEE") {
        throw new HttpError(409, "Commande annulée : aucun paiement ne peut y être enregistré.");
      }

      // Somme calculée côté base (aggregate), pas en récupérant toutes les
      // lignes pour les additionner en JS — et toujours en Prisma.Decimal,
      // jamais en flottant JS. annuleAt: null — un paiement annulé ne compte
      // plus dans le solde disponible (voir POST .../:paiementId/annuler).
      const agrege = await tx.paiement.aggregate({
        where: { commandeId, annuleAt: null },
        _sum: { montant: true },
      });
      const totalPayeAvant = agrege._sum.montant ?? new Prisma.Decimal(0);
      const soldeAvant = new Prisma.Decimal(commande.prixTotal).minus(totalPayeAvant);

      if (montantDecimal.greaterThan(soldeAvant)) {
        throw new HttpError(409, "Le paiement dépasse le solde restant de la commande.", {
          solde: soldeAvant.toString(),
          montant: data.montant,
        });
      }

      return tx.paiement.create({ data: { ...data, commandeId } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  res.status(201).json(paiement);
});

// GET /api/commandes/:commandeId/paiements — historique, plus récent en premier
router.get("/", async (req, res) => {
  const { commandeId } = req.params;
  const parsed = listPaiementsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize } = parsed.data;

  const commande = await prisma.commande.findUnique({
    where: { id: commandeId },
    select: { id: true, prixTotal: true },
  });
  if (!commande) throw new HttpError(404, "Commande introuvable.");

  const [data, total, agrege] = await Promise.all([
    prisma.paiement.findMany({
      where: { commandeId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.paiement.count({ where: { commandeId } }),
    // annuleAt: null — le résumé financier (totalPaye/solde) exclut les
    // paiements annulés, mais `data` ci-dessus renvoie TOUT l'historique
    // (annulés compris, avec leur motif) pour l'affichage.
    prisma.paiement.aggregate({ where: { commandeId, annuleAt: null }, _sum: { montant: true } }),
  ]);

  const totalPayeDecimal = agrege._sum.montant ?? new Prisma.Decimal(0);
  const { totalPaye, solde } = computeSolde(commande.prixTotal, [{ montant: totalPayeDecimal }]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    // Résumé financier calculé à la volée à partir des paiements réels —
    // jamais une valeur persistée (voir money.js).
    resume: { prixTotal: commande.prixTotal.toString(), totalPaye, solde, nombrePaiements: total },
  });
});

// GET /api/commandes/:commandeId/paiements/:paiementId — détail
router.get("/:paiementId", async (req, res) => {
  const { commandeId, paiementId } = req.params;
  const paiement = await prisma.paiement.findUnique({ where: { id: paiementId } });
  // Le paiement doit appartenir à LA commande de l'URL — jamais consultable
  // via l'URL d'une autre commande (IDOR).
  if (!paiement || paiement.commandeId !== commandeId) {
    throw new HttpError(404, "Paiement introuvable.");
  }
  res.json(paiement);
});

// Toujours aucune route DELETE ni PATCH : un paiement reste un événement
// financier historique, jamais supprimé ni modifié après coup. La seule
// correction possible est une ANNULATION LOGIQUE (ci-dessous) — la ligne
// d'origine n'est jamais touchée, seulement marquée.

// POST /api/commandes/:commandeId/paiements/:paiementId/annuler — annulation
// logique d'une erreur de saisie (montant faux, doublon, mauvaise commande...).
router.post("/:paiementId/annuler", async (req, res) => {
  const parsed = annulerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { commandeId, paiementId } = req.params;

  const paiement = await prisma.paiement.findUnique({ where: { id: paiementId } });
  if (!paiement || paiement.commandeId !== commandeId) {
    throw new HttpError(404, "Paiement introuvable.");
  }
  if (paiement.annuleAt) {
    throw new HttpError(409, "Ce paiement est déjà annulé.");
  }

  // Un reçu est un document déjà remis à la cliente attestant cet
  // encaissement précis : l'annuler rendrait ce reçu mensonger. Le blocage
  // est volontaire — aucune route ne permet de supprimer un Recu non plus.
  const recu = await prisma.recu.findUnique({ where: { paiementId }, select: { id: true, numero: true } });
  if (recu) {
    throw new HttpError(
      409,
      "Un reçu a déjà été émis pour ce paiement : annulation impossible.",
      { recuId: recu.id, numero: recu.numero },
    );
  }

  // updateMany + condition annuleAt:null : même garde atomique contre une
  // double-annulation concurrente que archiver/restaurer (Clientes, Modèles).
  const result = await prisma.paiement.updateMany({
    where: { id: paiementId, annuleAt: null },
    data: { annuleAt: new Date(), annuleMotif: parsed.data.motif },
  });
  if (result.count === 0) {
    throw new HttpError(409, "Ce paiement est déjà annulé.");
  }

  const misAJour = await prisma.paiement.findUnique({ where: { id: paiementId } });
  res.json(misAJour);
});

// POST /api/commandes/:commandeId/paiements/:paiementId/recu — émet le reçu
// lié à CE paiement précis. montantPaye = paiement.montant exactement
// (jamais recalculé/ressaisi) — le paiement est immuable, donc aucun risque
// de dérive entre le reçu et l'événement qu'il atteste.
router.post("/:paiementId/recu", async (req, res) => {
  const parsed = createRecuSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { commandeId, paiementId } = req.params;

  const paiement = await prisma.paiement.findUnique({ where: { id: paiementId } });
  // Le paiement doit appartenir à LA commande de l'URL — jamais consultable/
  // utilisable via l'URL d'une autre commande (IDOR), même logique que GET ci-dessus.
  if (!paiement || paiement.commandeId !== commandeId) {
    throw new HttpError(404, "Paiement introuvable.");
  }
  // Symétrique du garde-fou de POST .../annuler : un paiement annulé n'a
  // jamais eu lieu pour la comptabilité — aucun reçu ne peut l'attester.
  if (paiement.annuleAt) {
    throw new HttpError(409, "Ce paiement est annulé : aucun reçu ne peut être émis.");
  }

  // Garde applicative avant l'INSERT, en plus de la contrainte @unique sur
  // Recu.paiementId (backstop en cas de course concurrente, voir catch
  // ci-dessous) — même schéma que la prévention de double-livraison.
  const dejaEmis = await prisma.recu.findUnique({ where: { paiementId } });
  if (dejaEmis) {
    throw new HttpError(409, "Un reçu a déjà été émis pour ce paiement.", {
      recuId: dejaEmis.id,
      numero: dejaEmis.numero,
    });
  }

  let recu;
  try {
    recu = await prisma.$transaction(async (tx) => {
      const numero = await nextNumero(tx, "REC");
      return tx.recu.create({
        data: { commandeId, paiementId, montantPaye: paiement.montant, numero },
        include: RECU_INCLUDE,
      });
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err, "paiementId")) {
      throw new HttpError(409, "Un reçu a déjà été émis pour ce paiement.");
    }
    throw err;
  }

  res.status(201).json(recu);
});

// GET /api/commandes/:commandeId/paiements/:paiementId/recu — reçu lié à ce
// paiement, s'il a déjà été émis.
router.get("/:paiementId/recu", async (req, res) => {
  const { commandeId, paiementId } = req.params;
  const paiement = await prisma.paiement.findUnique({ where: { id: paiementId }, select: { commandeId: true } });
  if (!paiement || paiement.commandeId !== commandeId) {
    throw new HttpError(404, "Paiement introuvable.");
  }

  const recu = await prisma.recu.findUnique({ where: { paiementId }, include: RECU_INCLUDE });
  if (!recu) throw new HttpError(404, "Aucun reçu émis pour ce paiement.");
  res.json(recu);
});

// ───────────────────────────────────────────────────────────────────────
// Routeur GLOBAL — monté sous /api/paiements (tous paiements, toutes
// commandes confondues). requireAuth appliqué explicitement ici (pas de
// routeur parent, contrairement au routeur imbriqué ci-dessus). Lecture
// seule : la création/annulation d'un paiement reste exclusivement via la
// route imbriquée (/commandes/:commandeId/paiements), qui seule connaît le
// contexte nécessaire (verrou de la commande, calcul du solde disponible).
// ───────────────────────────────────────────────────────────────────────
export const paiementsGlobalRouter = Router();
paiementsGlobalRouter.use(requireAuth);

const PAIEMENT_GLOBAL_INCLUDE = {
  commande: {
    select: {
      id: true,
      numero: true,
      cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
    },
  },
};

// GET /api/paiements — liste globale, recherche, filtres, pagination.
// Historique complet (paiements annulés compris, avec leur motif) — comme
// pour Dépenses, jamais filtrés hors de la liste par défaut, seulement des
// totaux ; ici il n'y a pas de total agrégé à exclure, la liste seule suffit.
paiementsGlobalRouter.get("/", async (req, res) => {
  const parsed = listPaiementsGlobalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, mode, dateFrom, dateTo, page, pageSize } = parsed.data;

  const where = {};
  if (mode) where.mode = mode;
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }
  if (q) {
    const digitsOnly = q.replace(/\D/g, "");
    where.OR = [
      { commande: { numero: { contains: q, mode: "insensitive" } } },
      { commande: { cliente: { nom: { contains: q, mode: "insensitive" } } } },
      { commande: { cliente: { prenom: { contains: q, mode: "insensitive" } } } },
      { reference: { contains: q, mode: "insensitive" } },
      ...(digitsOnly.length > 0 ? [{ commande: { cliente: { telephone: { contains: digitsOnly } } } }] : []),
    ];
  }

  const [data, total] = await Promise.all([
    prisma.paiement.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: PAIEMENT_GLOBAL_INCLUDE,
    }),
    prisma.paiement.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

export default router;
