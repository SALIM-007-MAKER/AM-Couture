import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { refuserDemandeSchema, accepterDemandeSchema, listDemandesQuerySchema } from "../schemas/demandeCommande.schema.js";

// Demandes de commande envoyées par des clients USER (§ plan rôle client,
// voir routes/moi.routes.js POST /api/moi/demandes) — gestion côté ADMIN.
// Un USER PROPOSE, l'ADMIN DÉCIDE : jamais de création de Commande depuis
// ce module, seulement un lien vers une Commande créée par le flux normal
// (voir accepterDemandeSchema, demandeCommande.schema.js).
const router = Router();
router.use(requireAuth, requireAtelier, requireAbonnementActif);
router.param("id", requireValidIdParam);

const DEMANDE_SELECT = {
  id: true,
  statut: true,
  description: true,
  motifRefus: true,
  commandeId: true,
  createdAt: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
  modele: { select: { id: true, nom: true, categorie: true } },
  commande: { select: { id: true, numero: true } },
};

// GET /api/demandes — liste, filtre par statut, paginée.
router.get("/", async (req, res) => {
  const parsed = listDemandesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { statut, page, pageSize } = parsed.data;

  const where = { atelierId: req.user.atelierId, ...(statut ? { statut } : {}) };
  const [data, total] = await Promise.all([
    prisma.demandeCommande.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: DEMANDE_SELECT,
    }),
    prisma.demandeCommande.count({ where }),
  ]);

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/demandes/:id — détail.
router.get("/:id", async (req, res) => {
  const demande = await prisma.demandeCommande.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
    select: DEMANDE_SELECT,
  });
  if (!demande) throw new HttpError(404, "Demande introuvable.");
  res.json(demande);
});

// POST /api/demandes/:id/accepter { commandeId } — lie une Commande DÉJÀ
// CRÉÉE (via le flux normal POST /api/commandes) à cette demande. Vérifie
// que la commande appartient au MÊME atelier ET à la MÊME cliente que la
// demande — sans ce garde-fou, l'ADMIN pourrait par erreur (ou abus)
// rattacher n'importe quelle commande à une demande d'un autre client.
router.post("/:id/accepter", async (req, res) => {
  const parsed = accepterDemandeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const demande = await prisma.demandeCommande.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
  });
  if (!demande) throw new HttpError(404, "Demande introuvable.");
  if (demande.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette demande a déjà été traitée.");
  }

  const commande = await prisma.commande.findFirst({
    where: { id: parsed.data.commandeId, atelierId: req.user.atelierId, clienteId: demande.clienteId },
    select: { id: true },
  });
  if (!commande) {
    throw new HttpError(404, "Commande introuvable pour ce client.", { commandeId: ["Commande introuvable pour ce client."] });
  }

  const dejaLiee = await prisma.demandeCommande.findUnique({ where: { commandeId: commande.id } });
  if (dejaLiee) {
    throw new HttpError(409, "Cette commande est déjà liée à une autre demande.");
  }

  const misAJour = await prisma.demandeCommande.update({
    where: { id: demande.id },
    data: { statut: "ACCEPTEE", commandeId: commande.id },
    select: DEMANDE_SELECT,
  });
  res.json(misAJour);
});

// POST /api/demandes/:id/refuser { motifRefus? } — refuse définitivement,
// jamais de suppression (même discipline que le reste de l'app).
router.post("/:id/refuser", async (req, res) => {
  const parsed = refuserDemandeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const result = await prisma.demandeCommande.updateMany({
    where: { id: req.params.id, atelierId: req.user.atelierId, statut: "EN_ATTENTE" },
    data: { statut: "REFUSEE", motifRefus: parsed.data.motifRefus },
  });
  if (result.count === 0) {
    const existante = await prisma.demandeCommande.findFirst({
      where: { id: req.params.id, atelierId: req.user.atelierId },
      select: { id: true },
    });
    if (!existante) throw new HttpError(404, "Demande introuvable.");
    throw new HttpError(409, "Cette demande a déjà été traitée.");
  }

  const demande = await prisma.demandeCommande.findUnique({ where: { id: req.params.id }, select: DEMANDE_SELECT });
  res.json(demande);
});

export default router;
