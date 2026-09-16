import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { reconcilierNotifications } from "../lib/notifications.js";
import {
  listNotificationsQuerySchema,
  patchNotificationSchema,
  idsBodySchema,
} from "../schemas/notification.schema.js";

const router = Router();
router.use(requireAuth, requireAtelier, requireAbonnementActif);
router.param("id", requireValidIdParam);

// Champs commande nécessaires pour reconstruire l'affichage (client, modèle,
// statut, date de livraison) — voir demande Phase 4. Aucun texte de
// notification stocké : tout vient de là, à la lecture (voir schema.prisma,
// commentaire du modèle Notification).
const COMMANDE_SELECT = {
  id: true,
  numero: true,
  statut: true,
  typeVetement: true,
  dateLivraisonPrevue: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
  modele: { select: { nom: true } },
};

// GET /api/notifications?lu=&page=&pageSize= — réconcilie puis liste, plus
// récente d'abord. `lu` omis = toutes confondues.
router.get("/", async (req, res) => {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { lu, page, pageSize } = parsed.data;

  await reconcilierNotifications(prisma, req.user.atelierId);

  const where = { commande: { atelierId: req.user.atelierId }, ...(lu === undefined ? {} : { lu }) };
  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { commande: { select: COMMANDE_SELECT } },
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/notifications/nombre-non-lues — pastille de l'en-tête (voir
// AppLayout.jsx). Déclarée avant "/:id" pour ne pas être capturée comme un
// identifiant (même précaution que /derniere sur Mesures).
router.get("/nombre-non-lues", async (req, res) => {
  await reconcilierNotifications(prisma, req.user.atelierId);
  const count = await prisma.notification.count({
    where: { lu: false, commande: { atelierId: req.user.atelierId } },
  });
  res.json({ count });
});

// PATCH /api/notifications/:id — { lu: true|false }, marquer lu/non lu à l'unité.
router.patch("/:id", async (req, res) => {
  const parsed = patchNotificationSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const notif = await prisma.notification.findFirst({
    where: { id: req.params.id, commande: { atelierId: req.user.atelierId } },
  });
  if (!notif) throw new HttpError(404, "Notification introuvable.");

  const updated = await prisma.notification.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

// POST /api/notifications/marquer-lu { ids: [...] } — sélection multiple.
// atelierId dans le where : un id d'une autre atelier dans la sélection est
// silencieusement ignoré (0 ligne affectée pour lui), jamais modifié (IDOR).
router.post("/marquer-lu", async (req, res) => {
  const parsed = idsBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const result = await prisma.notification.updateMany({
    where: { id: { in: parsed.data.ids }, commande: { atelierId: req.user.atelierId } },
    data: { lu: true },
  });
  res.json({ count: result.count });
});

// POST /api/notifications/supprimer { ids: [...] } — sélection multiple.
// Note (voir audit Phase 4) : une notification supprimée réapparaîtra à la
// prochaine réconciliation si sa cause est toujours vraie (ex. commande
// toujours en retard) — comportement voulu, pas un bug.
router.post("/supprimer", async (req, res) => {
  const parsed = idsBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const result = await prisma.notification.deleteMany({
    where: { id: { in: parsed.data.ids }, commande: { atelierId: req.user.atelierId } },
  });
  res.json({ count: result.count });
});

export default router;
