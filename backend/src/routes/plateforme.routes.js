import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { contactSchema } from "../schemas/plateforme.schema.js";

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

export default router;
