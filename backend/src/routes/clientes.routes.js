import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import {
  createClienteSchema,
  updateClienteSchema,
  listClientesQuerySchema,
} from "../schemas/cliente.schema.js";
import mesuresRouter from "./mesures.routes.js";

const router = Router();

// Toutes les routes Clientes (et Mesures, montées ci-dessous) exigent une
// session valide ET un compte ADMIN rattaché à un atelier (Phase 8 —
// multi-tenant, voir auth.middleware.js).
router.use(requireAuth, requireAtelier);

// Rétro-portage du garde-fou anti-octet-nul/caractères de contrôle, déjà en
// place sur Commandes/Paiements/Livraisons/Dépenses/Reçus depuis le module 5
// (voir lib/idParam.js) — signalé comme point ouvert dans chaque rapport
// depuis, jamais traité jusqu'ici. S'applique aussi à :id dans les routes
// Mesures imbriquées ci-dessous (mergeParams).
router.param("id", requireValidIdParam);

// Module Mesures — routes imbriquées /api/clientes/:id/mesures/...
router.use("/:id/mesures", mesuresRouter);

/**
 * Refuse la création/modification si le numéro (déjà normalisé) est utilisé
 * par une autre cliente — active ou archivée : un doublon "évident" reste un
 * doublon même si l'ancienne fiche a été archivée (le bon geste est alors de
 * la restaurer, pas d'en recréer une nouvelle).
 */
async function assertPhoneAvailable(atelierId, telephone, excludeId) {
  const existing = await prisma.cliente.findFirst({
    where: {
      atelierId,
      telephone,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, nom: true, prenom: true, archivedAt: true },
  });
  if (existing) {
    throw new HttpError(409, "Un client existe déjà avec ce numéro de téléphone.", {
      clienteId: existing.id,
      nom: existing.nom,
      prenom: existing.prenom,
      archivee: Boolean(existing.archivedAt),
    });
  }
}

// POST /api/clientes — création
router.post("/", async (req, res) => {
  const parsed = createClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;

  await assertPhoneAvailable(req.user.atelierId, data.telephone);

  const cliente = await prisma.cliente.create({ data: { ...data, atelierId: req.user.atelierId } });
  res.status(201).json(cliente);
});

// GET /api/clientes — liste, recherche (nom/prénom/téléphone), filtre archivage, pagination
router.get("/", async (req, res) => {
  const parsed = listClientesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, archived, page, pageSize } = parsed.data;

  const where = { atelierId: req.user.atelierId };
  // Par défaut : uniquement les clientes actives. "archived=true" isole les
  // archivées, "archived=all" retire le filtre pour tout voir.
  if (archived === "false") where.archivedAt = null;
  else if (archived === "true") where.archivedAt = { not: null };

  if (q) {
    const digitsOnly = q.replace(/\D/g, "");
    const or = [
      { nom: { contains: q, mode: "insensitive" } },
      { prenom: { contains: q, mode: "insensitive" } },
    ];
    // N'ajoute la comparaison téléphone que si la recherche contient des
    // chiffres : sinon "contains: ''" matcherait toutes les lignes et
    // casserait le filtrage par nom.
    if (digitsOnly.length > 0) {
      or.push({ telephone: { contains: digitsOnly } });
      or.push({ telephone2: { contains: digitsOnly } });
    }
    where.OR = or;
  }

  const [rows, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Champs additionnels pour la liste (nombre de commandes, dernière
      // activité) — purement en lecture, aucun champ existant retiré/modifié.
      include: {
        _count: { select: { commandes: true } },
        commandes: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.cliente.count({ where }),
  ]);

  const data = rows.map(({ _count, commandes, ...cliente }) => ({
    ...cliente,
    nombreCommandes: _count.commandes,
    derniereActivite: commandes[0]?.createdAt ?? null,
  }));

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/clientes/:id — consultation (y compris archivée : la fiche reste consultable)
router.get("/:id", async (req, res) => {
  const cliente = await prisma.cliente.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!cliente) throw new HttpError(404, "Client introuvable.");
  res.json(cliente);
});

const D0 = new Prisma.Decimal(0);
const dec = (v) => (v == null ? D0 : new Prisma.Decimal(v));

// GET /api/clientes/:id/totaux — totaux agrégés sur TOUTES les commandes du
// client (calculés en base, jamais en paginant une liste côté client — un
// client avec plus d'une page de commandes donnerait sinon un total faux).
// Même convention que Dashboard/Rapports (voir dashboard.routes.js) : la
// valeur des commandes n'exclut pas les commandes ANNULEE, exactement comme
// le solde d'une commande individuelle (computeSolde) ne le fait pas non
// plus — un statut de commande et un total financier restent deux
// informations distinctes ici, jamais mélangées.
router.get("/:id/totaux", async (req, res) => {
  const { id } = req.params;
  const cliente = await prisma.cliente.findFirst({
    where: { id, atelierId: req.user.atelierId },
    select: { id: true },
  });
  if (!cliente) throw new HttpError(404, "Client introuvable.");

  const [commandesAgg, paiementsAgg] = await Promise.all([
    prisma.commande.aggregate({ where: { clienteId: id }, _sum: { prixTotal: true } }),
    prisma.paiement.aggregate({
      where: { annuleAt: null, commande: { clienteId: id } },
      _sum: { montant: true },
    }),
  ]);

  const totalCommandes = dec(commandesAgg._sum.prixTotal);
  const totalPaye = dec(paiementsAgg._sum.montant);

  res.json({
    totalCommandes: totalCommandes.toString(),
    totalPaye: totalPaye.toString(),
    totalRestant: totalCommandes.minus(totalPaye).toString(),
  });
});

// PATCH /api/clientes/:id — modification (interdite sur une fiche archivée)
router.patch("/:id", async (req, res) => {
  const parsed = updateClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;
  const { id } = req.params;

  if (data.telephone) {
    await assertPhoneAvailable(req.user.atelierId, data.telephone, id);
  }

  // updateMany avec condition sur archivedAt : évite une lecture-puis-écriture
  // non atomique (double-clic / retry concurrent sur la même fiche).
  // atelierId dans le where : une commande d'un autre atelier avec le même
  // id (impossible en pratique, cuid, mais gardé par défense en profondeur)
  // ne serait de toute façon jamais modifiée.
  const result = await prisma.cliente.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data,
  });

  if (result.count === 0) {
    const existing = await prisma.cliente.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Client introuvable.");
    throw new HttpError(409, "Client archivé : restaurez-le avant de le modifier.");
  }

  const cliente = await prisma.cliente.findUnique({ where: { id } });
  res.json(cliente);
});

// POST /api/clientes/:id/archiver — archivage (jamais de suppression physique)
router.post("/:id/archiver", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.cliente.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    const existing = await prisma.cliente.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Client introuvable.");
    throw new HttpError(409, "Client déjà archivé.");
  }

  const cliente = await prisma.cliente.findUnique({ where: { id } });
  res.json(cliente);
});

// POST /api/clientes/:id/restaurer — réactivation d'une fiche archivée
router.post("/:id/restaurer", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.cliente.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });

  if (result.count === 0) {
    const existing = await prisma.cliente.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Client introuvable.");
    throw new HttpError(409, "Client déjà actif.");
  }

  const cliente = await prisma.cliente.findUnique({ where: { id } });
  res.json(cliente);
});

export default router;
