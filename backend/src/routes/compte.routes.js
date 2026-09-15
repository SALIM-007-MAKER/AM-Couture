import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { changePasswordSchema, updateCompteSchema } from "../schemas/compte.schema.js";
import { signAuthToken } from "../lib/jwt.js";
import { setAuthCookie } from "../lib/authCookie.js";

// "Mon compte" (Phase 6) — distinct de /api/parametres (profil ATELIER) :
// ce module concerne uniquement le compte de connexion (identifiant unique
// dans cette app, voir seed.js — pas de gestion multi-utilisateurs).
const router = Router();
router.use(requireAuth);

// PATCH /api/compte — préférences du compte (langue pour l'instant).
router.patch("/", async (req, res) => {
  const parsed = updateCompteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data: parsed.data });
  res.json({ id: user.id, identifiant: user.identifiant, langue: user.langue, createdAt: user.createdAt });
});

// PATCH /api/compte/mot-de-passe — changement de mot de passe, exige
// l'actuel (évite qu'une session volée/laissée ouverte permette de
// verrouiller le compte hors de portée du propriétaire légitime).
router.patch("/mot-de-passe", async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { motDePasseActuel, nouveauMotDePasse } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new HttpError(401, "Session invalide.");

  const valide = await bcrypt.compare(motDePasseActuel, user.passwordHash);
  if (!valide) {
    throw new HttpError(400, "Champs invalides.", { motDePasseActuel: ["Mot de passe actuel incorrect."] });
  }

  // Coût 12 — identique à prisma/seed.js, seule autre origine d'un hash dans ce projet.
  const passwordHash = await bcrypt.hash(nouveauMotDePasse, 12);
  // sessionVersion incrémenté : voir auth.middleware.js (requireAuth) — cela
  // invalide IMMÉDIATEMENT toute autre session déjà ouverte ailleurs avec
  // l'ancien mot de passe. On réémet donc aussitôt un nouveau jeton/cookie
  // pour CETTE session-ci (celle qui vient de faire le changement) : sans
  // ça, la personne se déconnecterait elle-même en changeant son propre
  // mot de passe.
  const userMaj = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  const token = signAuthToken(userMaj);
  setAuthCookie(res, token);
  res.status(204).end();
});

export default router;
