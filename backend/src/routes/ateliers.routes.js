import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { creerAtelierSchema } from "../schemas/atelierAdmin.schema.js";
import { creerAtelierEtAdmin } from "../lib/atelierProvisioning.js";

// Réservé au SUPERADMIN de la plateforme (Phase 8 — multi-tenant) : gestion
// des ateliers (tenants). Un ADMIN n'accède jamais à ces routes — il gère
// SON atelier via /api/parametres (voir parametres.routes.js).
const router = Router();
router.use(requireAuth, requireSuperadmin);

// GET /api/ateliers — liste tous les ateliers de la plateforme, avec un
// aperçu de leur activité (nombre de comptes/clientes/commandes).
router.get("/", async (req, res) => {
  const ateliers = await prisma.atelier.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, clientes: true, commandes: true } },
    },
  });
  res.json(
    ateliers.map(({ _count, ...atelier }) => ({
      ...atelier,
      nombreComptes: _count.users,
      nombreClientes: _count.clientes,
      nombreCommandes: _count.commandes,
    })),
  );
});

// POST /api/ateliers — crée un nouvel atelier (tenant) + son premier compte
// ADMIN, atomiquement. Voie RÉSERVÉE AU SUPERADMIN (provisioning depuis la
// plateforme) — un propriétaire d'atelier a sa propre voie en libre-service,
// non-authentifiée : POST /api/auth/inscription-atelier (auth.routes.js).
// Les deux partagent la même logique de création (creerAtelierEtAdmin).
router.post("/", async (req, res) => {
  const parsed = creerAtelierSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { atelier, admin } = await creerAtelierEtAdmin(parsed.data);
  res.status(201).json({ atelier, admin: { id: admin.id, identifiant: admin.identifiant } });
});

export default router;
