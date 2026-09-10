import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { isUniqueConstraintViolation } from "../lib/prismaErrors.js";
import { STATUT_TRANSITIONS } from "../schemas/commande.schema.js";
import {
  createLivraisonSchema,
  listLivraisonsQuerySchema,
  listLivraisonsGlobalQuerySchema,
} from "../schemas/livraison.schema.js";
import { annulerSchema } from "../schemas/annulation.schema.js";

// mergeParams: true — monté sous /api/commandes/:commandeId/livraisons.
// requireAuth et la validation de :commandeId sont déjà appliqués par le
// routeur parent (commandes.routes.js) avant le montage.
const router = Router({ mergeParams: true });

router.param("livraisonId", requireValidIdParam);

// POST /api/commandes/:commandeId/livraisons — création (+ paiement final optionnel, atomique)
router.post("/", async (req, res) => {
  const parsed = createLivraisonSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { dateLivraison, commentaire, paiementFinal } = parsed.data;
  const { commandeId } = req.params;

  let result;
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Même verrou que Paiements (SELECT ... FOR UPDATE sur Commande) :
        // sérialise cette création vis-à-vis d'un paiement concurrent ET
        // d'une autre tentative de livraison sur la MÊME commande. Le
        // paiement final éventuel de CETTE requête profite du même verrou —
        // pas de lecture de solde non protégée.
        const locked = await tx.$queryRaw`SELECT id FROM "Commande" WHERE id = ${commandeId} FOR UPDATE`;
        if (locked.length === 0) throw new HttpError(404, "Commande introuvable.");

        const commande = await tx.commande.findUnique({ where: { id: commandeId } });
        if (!commande) throw new HttpError(404, "Commande introuvable.");

        // Réutilise la machine à états déjà validée du module Commandes —
        // aucun workflow inventé ici. Actuellement, seul TERMINEE autorise
        // LIVREE, donc une commande pas encore terminée OU déjà livrée/annulée
        // est rejetée avec le même vocabulaire que POST /commandes/:id/statut.
        const transitionsAutorisees = STATUT_TRANSITIONS[commande.statut] ?? [];
        if (!transitionsAutorisees.includes("LIVREE")) {
          throw new HttpError(409, `Livraison impossible depuis le statut ${commande.statut}.`, {
            statutActuel: commande.statut,
          });
        }

        // Garde applicative avant l'INSERT (en plus de l'index unique
        // PARTIEL sur Livraison.commandeId WHERE annuleAt IS NULL, backstop
        // en cas de violation — voir le catch ci-dessous) : message métier
        // clair plutôt qu'une erreur Prisma brute. findFirst (pas
        // findUnique) : commandeId n'est plus une contrainte unique en base
        // depuis l'ajout de l'annulation — une commande peut avoir plusieurs
        // lignes Livraison dans le temps, au plus une ACTIVE à la fois.
        const dejaLivree = await tx.livraison.findFirst({ where: { commandeId, annuleAt: null } });
        if (dejaLivree) {
          throw new HttpError(409, "Cette commande a déjà été livrée.");
        }

        // annuleAt: null — un paiement annulé ne compte plus dans le solde.
        const agrege = await tx.paiement.aggregate({
          where: { commandeId, annuleAt: null },
          _sum: { montant: true },
        });
        const totalPayeAvant = agrege._sum.montant ?? new Prisma.Decimal(0);
        const soldeAvant = new Prisma.Decimal(commande.prixTotal).minus(totalPayeAvant);

        let paiement = null;
        let soldeApres = soldeAvant;
        if (paiementFinal) {
          const montantDecimal = new Prisma.Decimal(paiementFinal.montant);
          if (montantDecimal.greaterThan(soldeAvant)) {
            throw new HttpError(409, "Le paiement final dépasse le solde restant de la commande.", {
              solde: soldeAvant.toString(),
              montant: paiementFinal.montant,
            });
          }
          paiement = await tx.paiement.create({ data: { ...paiementFinal, commandeId } });
          soldeApres = soldeAvant.minus(montantDecimal);
        }

        // Snapshot calculé côté serveur, APRÈS le paiement final éventuel de
        // cette même requête — jamais la valeur envoyée par le client (le
        // schéma n'accepte même pas ce champ, voir livraison.schema.js).
        const livraison = await tx.livraison.create({
          data: {
            commandeId,
            montantRestant: soldeApres.toString(),
            ...(dateLivraison ? { dateLivraison } : {}),
            ...(commentaire ? { commentaire } : {}),
          },
        });

        await tx.commande.update({ where: { id: commandeId }, data: { statut: "LIVREE" } });

        return {
          livraison,
          paiement,
          totalPayeApres: paiement ? totalPayeAvant.plus(paiement.montant) : totalPayeAvant,
          soldeApres,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (err) {
    // Backstop défensif : si malgré le verrou + la pré-vérification une
    // violation de la contrainte unique survient quand même, on la
    // transforme en 409 propre plutôt que de laisser une erreur Prisma brute
    // remonter (voir anomalie similaire déjà corrigée au module Commandes).
    if (isUniqueConstraintViolation(err, "commandeId")) {
      throw new HttpError(409, "Cette commande a déjà été livrée.");
    }
    throw err;
  }

  res.status(201).json({
    ...result.livraison,
    paiementFinal: result.paiement,
    totalPaye: result.totalPayeApres.toString(),
    solde: result.soldeApres.toString(),
  });
});

// GET /api/commandes/:commandeId/livraisons — historique complet (annulées
// comprises) ; normalement 0 ou 1 ligne ACTIVE, mais l'historique peut
// contenir plusieurs lignes si une précédente a été annulée puis recréée.
router.get("/", async (req, res) => {
  const { commandeId } = req.params;
  const parsed = listLivraisonsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize } = parsed.data;

  const commande = await prisma.commande.findUnique({ where: { id: commandeId }, select: { id: true } });
  if (!commande) throw new HttpError(404, "Commande introuvable.");

  const [data, total] = await Promise.all([
    prisma.livraison.findMany({
      where: { commandeId },
      orderBy: [{ dateLivraison: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.livraison.count({ where: { commandeId } }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/commandes/:commandeId/livraisons/:livraisonId — détail
router.get("/:livraisonId", async (req, res) => {
  const { commandeId, livraisonId } = req.params;
  const livraison = await prisma.livraison.findUnique({ where: { id: livraisonId } });
  // La livraison doit appartenir à LA commande de l'URL — jamais consultable
  // via l'URL d'une autre commande (IDOR).
  if (!livraison || livraison.commandeId !== commandeId) {
    throw new HttpError(404, "Livraison introuvable.");
  }
  res.json(livraison);
});

// Toujours aucune route DELETE ni PATCH : une livraison reste un événement
// métier historique. Seule une ANNULATION LOGIQUE (ci-dessous) permet de
// corriger une erreur de saisie (ex: mauvaise commande cliquée par erreur).

// POST /api/commandes/:commandeId/livraisons/:livraisonId/annuler —
// annulation logique. Comme LIVREE est un statut TERMINAL (aucune transition
// sortante, voir STATUT_TRANSITIONS), annuler LA livraison qui a fait passer
// la commande à LIVREE doit obligatoirement la ramener à TERMINEE dans la
// MÊME transaction — sinon la commande resterait bloquée à LIVREE pour
// toujours alors qu'elle n'a plus aucune livraison active. Le paiement final
// éventuellement encaissé au moment de cette livraison n'est PAS annulé
// automatiquement : ce sont deux corrections indépendantes (voir
// paiements.routes.js si ce paiement doit, lui aussi, être annulé).
router.post("/:livraisonId/annuler", async (req, res) => {
  const parsed = annulerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { commandeId, livraisonId } = req.params;

  await prisma.$transaction(
    async (tx) => {
      // Même verrou que la création (SELECT ... FOR UPDATE) : sérialise
      // cette annulation vis-à-vis d'une création de livraison concurrente
      // sur la même commande.
      const locked = await tx.$queryRaw`SELECT id FROM "Commande" WHERE id = ${commandeId} FOR UPDATE`;
      if (locked.length === 0) throw new HttpError(404, "Commande introuvable.");

      const livraison = await tx.livraison.findUnique({ where: { id: livraisonId } });
      if (!livraison || livraison.commandeId !== commandeId) {
        throw new HttpError(404, "Livraison introuvable.");
      }
      if (livraison.annuleAt) {
        throw new HttpError(409, "Cette livraison est déjà annulée.");
      }

      const result = await tx.livraison.updateMany({
        where: { id: livraisonId, annuleAt: null },
        data: { annuleAt: new Date(), annuleMotif: parsed.data.motif },
      });
      if (result.count === 0) {
        throw new HttpError(409, "Cette livraison est déjà annulée.");
      }

      // Ramène la commande à TERMINEE UNIQUEMENT si elle est encore au
      // statut LIVREE fixé par CETTE livraison — un garde-fou par simple
      // bon sens : si le statut a déjà été changé entre-temps par un autre
      // mécanisme, on ne l'écrase pas silencieusement.
      await tx.commande.updateMany({
        where: { id: commandeId, statut: "LIVREE" },
        data: { statut: "TERMINEE" },
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  const misAJour = await prisma.livraison.findUnique({ where: { id: livraisonId } });
  res.json(misAJour);
});

// ───────────────────────────────────────────────────────────────────────
// Routeur GLOBAL — monté sous /api/livraisons (toutes livraisons, toutes
// commandes confondues), même principe que paiementsGlobalRouter
// (paiements.routes.js) : lecture seule, requireAuth explicite.
// ───────────────────────────────────────────────────────────────────────
export const livraisonsGlobalRouter = Router();
livraisonsGlobalRouter.use(requireAuth);

const LIVRAISON_GLOBAL_INCLUDE = {
  commande: {
    select: {
      id: true,
      numero: true,
      cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
    },
  },
};

// GET /api/livraisons — liste globale (annulées comprises), recherche, filtres.
livraisonsGlobalRouter.get("/", async (req, res) => {
  const parsed = listLivraisonsGlobalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, dateFrom, dateTo, page, pageSize } = parsed.data;

  const where = {};
  if (dateFrom || dateTo) {
    where.dateLivraison = {
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
      ...(digitsOnly.length > 0 ? [{ commande: { cliente: { telephone: { contains: digitsOnly } } } }] : []),
    ];
  }

  const [data, total] = await Promise.all([
    prisma.livraison.findMany({
      where,
      orderBy: [{ dateLivraison: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: LIVRAISON_GLOBAL_INCLUDE,
    }),
    prisma.livraison.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

export default router;
