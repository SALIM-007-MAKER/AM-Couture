import { z } from "zod";

// Préférence stockée uniquement (Phase 6) : aucune traduction réelle de
// l'interface derrière ce choix pour l'instant — voir User.langue
// (schema.prisma) et LANGUES_DISPONIBLES côté frontend (constants.js),
// qui doit rester synchronisé avec cette liste.
export const LANGUES_DISPONIBLES = ["fr", "en", "ha"];

export const updateCompteSchema = z
  .object({
    langue: z.enum(LANGUES_DISPONIBLES),
  })
  .strict();

// Bornes volontairement simples (8 caractères minimum) — cohérent avec le
// niveau de rigueur du reste du projet (pas de règle de complexité inventée
// au-delà de ce qui est réellement appliqué ailleurs).
export const changePasswordSchema = z
  .object({
    motDePasseActuel: z.string().min(1, "Mot de passe actuel requis."),
    nouveauMotDePasse: z.string().min(8, "8 caractères minimum."),
  })
  .strict()
  .refine((data) => data.motDePasseActuel !== data.nouveauMotDePasse, {
    path: ["nouveauMotDePasse"],
    message: "Le nouveau mot de passe doit être différent de l'actuel.",
  });
