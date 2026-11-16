import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireMembreAtelier, requireAbonnementActif, requirePermission } from "../middlewares/auth.middleware.js";
import { masquerFinancesSiNonAutorise } from "../lib/masquageFinances.js";
import { aPermission } from "../lib/permissions.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { quantitesArticles } from "../lib/stock.js";
import { reconcilierNotifications, whereVisiblePour, whereNonLuePour } from "../lib/notifications.js";
import { listNotificationsQuerySchema, patchNotificationSchema, idsBodySchema } from "../schemas/notification.schema.js";

const router = Router();
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, requirePermission("notifications.lire"), masquerFinancesSiNonAutorise);
router.param("id", requireValidIdParam);

// Champs nécessaires pour reconstruire l'affichage : aucun texte de notification n'est stocké, tout vient de la
// commande, de l'article ou de l'achat réels à la lecture (voir schema.prisma, modèle Notification).
const COMMANDE_SELECT = {
  id: true,
  numero: true,
  statut: true,
  typeVetement: true,
  dateLivraisonPrevue: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
  modele: { select: { nom: true } },
};
const INCLUDE = {
  commande: { select: COMMANDE_SELECT },
  article: { select: { id: true, nom: true, unite: true, seuilAlerte: true } },
  achat: { select: { id: true, numero: true, dateAttendue: true, fournisseur: { select: { nom: true } } } },
};

/** Ce que la personne voit ET (pour un employé) ce qu'elle a lu : un employé ne touche jamais l'état du PDG. */
const lue = (n, user) => (user.role === "ADMIN" ? n.lu : n.lectures.length > 0);

// GET /api/notifications?lu=&page=&pageSize= — réconcilie puis liste, plus récente d'abord. `lu` omis = toutes.
router.get("/", async (req, res) => {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { lu, page, pageSize } = parsed.data;

  await reconcilierNotifications(prisma, req.user.atelierId);

  const where = { AND: [whereVisiblePour(req.user), ...(lu === undefined ? [] : [whereNonLuePour(req.user, lu)])] };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { ...INCLUDE, lectures: { where: { userId: req.user.id }, select: { userId: true } } },
    }),
    prisma.notification.count({ where }),
  ]);

  // Quantité actuelle des articles en stock bas (une requête groupée pour toute la page).
  const ids = rows.filter((n) => n.articleId).map((n) => n.articleId);
  const quantites = await quantitesArticles(prisma, ids);
  const data = rows.map(({ lectures, ...n }) => ({
    ...n,
    lu: lue({ ...n, lectures }, req.user),
    ...(n.articleId ? { article: { ...n.article, quantite: quantites.get(n.articleId).toString() } } : {}),
  }));

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/notifications/nombre-non-lues — pastille de l'en-tête. Déclarée avant "/:id".
// Inclut les demandes de commande EN_ATTENTE (modèle séparé, même attention requise) pour qui peut les voir.
router.get("/nombre-non-lues", async (req, res) => {
  await reconcilierNotifications(prisma, req.user.atelierId);
  const [notifications, demandes] = await Promise.all([
    prisma.notification.count({ where: { AND: [whereVisiblePour(req.user), whereNonLuePour(req.user, false)] } }),
    aPermission(req.user, "demandes.lire")
      ? prisma.demandeCommande.count({ where: { atelierId: req.user.atelierId, statut: "EN_ATTENTE" } })
      : 0,
  ]);
  res.json({ count: notifications + demandes, notifications, demandes });
});

/** Marque lue / non lue UNE notification pour cette personne (drapeau partagé pour le PDG, lecture individuelle pour un employé). */
async function appliquerLecture(req, ids, lu) {
  if (req.user.role === "ADMIN") {
    return (await prisma.notification.updateMany({ where: { AND: [whereVisiblePour(req.user), { id: { in: ids } }] }, data: { lu } })).count;
  }
  // Employé : seulement parmi ce qu'il a le droit de voir (un identifiant hors de sa vue est ignoré, jamais modifié).
  const visibles = await prisma.notification.findMany({ where: { AND: [whereVisiblePour(req.user), { id: { in: ids } }] }, select: { id: true } });
  const idsVisibles = visibles.map((n) => n.id);
  if (lu) {
    await prisma.notificationLue.createMany({ data: idsVisibles.map((notificationId) => ({ notificationId, userId: req.user.id })), skipDuplicates: true });
  } else {
    await prisma.notificationLue.deleteMany({ where: { userId: req.user.id, notificationId: { in: idsVisibles } } });
  }
  return idsVisibles.length;
}

// PATCH /api/notifications/:id — { lu: true|false }
router.patch("/:id", async (req, res) => {
  const parsed = patchNotificationSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const modifiees = await appliquerLecture(req, [req.params.id], parsed.data.lu);
  if (modifiees === 0) throw new HttpError(404, "Notification introuvable.");
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id }, include: { lectures: { where: { userId: req.user.id }, select: { userId: true } } } });
  const { lectures, ...reste } = notif;
  res.json({ ...reste, lu: lue(notif, req.user) });
});

// POST /api/notifications/marquer-lu { ids: [...] } — sélection multiple ; un identifiant hors de la vue est ignoré.
router.post("/marquer-lu", async (req, res) => {
  const parsed = idsBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  res.json({ count: await appliquerLecture(req, parsed.data.ids, true) });
});

// POST /api/notifications/supprimer { ids: [...] } — réservé au PDG : supprimer agit sur l'état de tout l'atelier
// (la notification réapparaît à la prochaine réconciliation si sa cause est toujours vraie — comportement voulu).
router.post("/supprimer", async (req, res) => {
  if (req.user.role !== "ADMIN") throw new HttpError(403, "Seul le responsable de l'atelier peut supprimer des notifications.");
  const parsed = idsBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const result = await prisma.notification.deleteMany({ where: { AND: [whereVisiblePour(req.user), { id: { in: parsed.data.ids } }] } });
  res.json({ count: result.count });
});

export default router;
