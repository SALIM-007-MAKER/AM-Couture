import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { loginSchema } from "../schemas/auth.schema.js";
import { signAuthToken } from "../lib/jwt.js";
import { setAuthCookie, clearAuthCookie } from "../lib/authCookie.js";
import { formatZodError } from "../lib/validation.js";

const router = Router();

// Hash bcrypt factice (mot de passe jamais utilisé ailleurs) comparé quand
// l'identifiant n'existe pas, pour que bcrypt.compare prenne un temps
// comparable dans les deux cas et empêche l'énumération de comptes par
// mesure du temps de réponse.
const DUMMY_HASH = "$2b$10$/4y/w0cvEjmIpLaIBO4xNOLAdvUoH3oNwzYFeJ7fUnPvdyqtJ22de";

// Rate limiting sur /login uniquement : 10 tentatives / 15 min / IP.
// Réponse volontairement générique pour ne pas aider un attaquant à calibrer.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { identifiant, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { identifiant } });
  const passwordHash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, passwordHash);

  // Message volontairement identique dans les deux cas (identifiant inconnu
  // ou mot de passe faux) : ne jamais révéler quel champ est incorrect.
  if (!user || !valid) {
    throw new HttpError(401, "Identifiant ou mot de passe incorrect.");
  }

  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.json({ id: user.id, identifiant: user.identifiant });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    // Compte supprimé après émission du token : on invalide le cookie côté client.
    clearAuthCookie(res);
    throw new HttpError(401, "Session invalide.");
  }
  res.json({ id: user.id, identifiant: user.identifiant, createdAt: user.createdAt });
});

export default router;
