import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { contactSchema, journalSecuriteQuerySchema } from "../schemas/plateforme.schema.js";

// Réglages globaux de la plateforme — SUPERADMIN uniquement (le PDG ne reçoit
// le contact qu'en lecture, via GET /api/abonnements/etat).
const router = Router();
router.use(requireAuth, requireSuperadmin);

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

export default router;
