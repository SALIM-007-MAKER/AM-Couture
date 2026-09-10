import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { nextNumero } from "../lib/numero.js";
import { streamRecuPdf } from "../lib/recuPdf.js";
import { RECU_INCLUDE } from "../lib/recuInclude.js";
import { createRecuSchema, listRecusQuerySchema, listRecusGlobalQuerySchema } from "../schemas/recu.schema.js";

// ───────────────────────────────────────────────────────────────────────
// Routeur imbriqué — monté sous /api/commandes/:commandeId/recus.
// requireAuth et la validation de :commandeId sont déjà appliqués par le
// routeur parent (commandes.routes.js) avant le montage.
// ───────────────────────────────────────────────────────────────────────
export const recusCommandeRouter = Router({ mergeParams: true });

// POST /api/commandes/:commandeId/recus — reçu RÉCAPITULATIF (sans paiement
// précis) : montantPaye = total encaissé sur la commande à cet instant,
// calculé côté base (aggregate), jamais en sommant en JS. Pas de verrou
// FOR UPDATE nécessaire : les paiements sont immuables (pas de PATCH/DELETE),
// donc rien ne peut invalider ce total après coup — c'est un instantané
// volontairement daté (createdAt du reçu), pas une valeur qui doit rester
// synchronisée avec le futur.
recusCommandeRouter.post("/", async (req, res) => {
  const parsed = createRecuSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { commandeId } = req.params;

  const recu = await prisma.$transaction(
    async (tx) => {
      const commande = await tx.commande.findUnique({ where: { id: commandeId }, select: { id: true } });
      if (!commande) throw new HttpError(404, "Commande introuvable.");

      // annuleAt: null — un paiement annulé n'a jamais eu lieu pour la
      // comptabilité, il ne doit pas gonfler le montant attesté par ce reçu.
      // Limite acceptée : si un paiement DÉJÀ inclus dans un récapitulatif
      // émis plus tôt est annulé ensuite, ce reçu passé ne se met pas à jour
      // rétroactivement — il reste, comme toujours, un instantané daté (voir
      // commentaire au-dessus), pas une valeur re-synchronisée en continu.
      const agrege = await tx.paiement.aggregate({
        where: { commandeId, annuleAt: null },
        _sum: { montant: true },
      });
      const montantPaye = agrege._sum.montant ?? new Prisma.Decimal(0);

      // Un reçu prouve un encaissement : émettre un reçu récapitulatif à 0
      // n'aurait aucun sens documentaire (aucun paiement à attester).
      if (montantPaye.lessThanOrEqualTo(0)) {
        throw new HttpError(409, "Aucun paiement encaissé sur cette commande : impossible d'émettre un reçu.");
      }

      const numero = await nextNumero(tx, "REC");
      return tx.recu.create({
        data: { commandeId, montantPaye: montantPaye.toString(), numero },
        include: RECU_INCLUDE,
      });
    },
    // Même ajustement que Commandes/Paiements/Livraisons (voir leurs
    // routes) : le défaut Prisma (5s) s'est révélé insuffisant sous latence
    // réseau réelle vers Neon — trouvé ici en conditions de charge, corrigé
    // par cohérence avec la convention déjà établie ailleurs dans le projet.
    { maxWait: 10_000, timeout: 15_000 },
  );

  res.status(201).json(recu);
});

// GET /api/commandes/:commandeId/recus — historique des reçus de la commande
// (récapitulatifs ET liés à un paiement précis), plus récent en premier.
recusCommandeRouter.get("/", async (req, res) => {
  const { commandeId } = req.params;
  const parsed = listRecusQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize } = parsed.data;

  const commande = await prisma.commande.findUnique({ where: { id: commandeId }, select: { id: true } });
  if (!commande) throw new HttpError(404, "Commande introuvable.");

  const [data, total] = await Promise.all([
    prisma.recu.findMany({
      where: { commandeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: RECU_INCLUDE,
    }),
    prisma.recu.count({ where: { commandeId } }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// ───────────────────────────────────────────────────────────────────────
// Routeur top-level — monté sous /api/recus (accès direct par id de reçu,
// pour la consultation/réimpression indépendamment de l'URL de la commande).
// requireAuth est appliqué explicitement ici (pas de routeur parent).
// ───────────────────────────────────────────────────────────────────────
const router = Router();

router.use(requireAuth);
router.param("id", requireValidIdParam);

// GET /api/recus — liste globale (tous reçus, toutes commandes confondues),
// recherche, filtres, pagination. Déclarée avant "/:id" pour ne pas être
// capturée comme un identifiant (même précaution que /derniere sur Mesures).
router.get("/", async (req, res) => {
  const parsed = listRecusGlobalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, dateFrom, dateTo, page, pageSize } = parsed.data;

  const where = {};
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }
  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { commande: { numero: { contains: q, mode: "insensitive" } } },
      { commande: { cliente: { nom: { contains: q, mode: "insensitive" } } } },
      { commande: { cliente: { prenom: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.recu.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: RECU_INCLUDE,
    }),
    prisma.recu.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/recus/:id — détail JSON
router.get("/:id", async (req, res) => {
  const recu = await prisma.recu.findUnique({ where: { id: req.params.id }, include: RECU_INCLUDE });
  if (!recu) throw new HttpError(404, "Reçu introuvable.");
  res.json(recu);
});

// GET /api/recus/:id/pdf — flux PDF (jamais stocké : régénéré à chaque appel)
router.get("/:id/pdf", async (req, res) => {
  const recu = await prisma.recu.findUnique({ where: { id: req.params.id }, include: RECU_INCLUDE });
  if (!recu) throw new HttpError(404, "Reçu introuvable.");

  // Singleton facultatif : le module Paramètres Atelier (pas encore
  // implémenté) n'a peut-être pas encore créé cette ligne. On dégrade
  // proprement (nom générique, pas de coordonnées) plutôt que d'échouer.
  const atelier = await prisma.atelier.findFirst();

  streamRecuPdf(res, { recu, atelier });
});

// Volontairement aucune route PATCH ni DELETE : un reçu est un document
// financier historique, jamais modifié ni supprimé après émission.

export default router;
