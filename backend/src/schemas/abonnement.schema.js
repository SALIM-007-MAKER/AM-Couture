import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";

// Activation MANUELLE par le SUPERADMIN (voir ateliersAbonnement.routes.js) —
// aucune donnée de paiement ici : le paiement en ligne, quand il existera,
// vivra dans lib/payments/ sans toucher à ces schémas.
const dateField = z.coerce
  .date({ error: "Date invalide." })
  .refine((d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100, "Date invalide.");
const noteField = z.string().trim().max(300).transform(normalizeText);

export const activerAbonnementSchema = z
  .object({
    planId: z.string().trim().min(1, "Plan requis."),
    dateDebut: dateField.optional(),
    // Soit une durée en mois (date d'expiration calculée), soit une date
    // d'expiration explicite — au moins l'une des deux.
    dureeMois: z.number().int().min(1, "Durée invalide.").max(60, "60 mois maximum.").optional(),
    dateExpiration: dateField.optional(),
    note: noteField.optional(),
  })
  .strict()
  .refine((d) => d.dureeMois || d.dateExpiration, {
    path: ["dureeMois"],
    message: "Indiquez une durée ou une date d'expiration.",
  });

export const modifierAbonnementSchema = z
  .object({
    planId: z.string().trim().min(1).optional(),
    dateDebut: dateField.optional(),
    dateExpiration: dateField.optional(),
    note: noteField.optional(),
  })
  .strict()
  .refine((d) => d.planId || d.dateDebut || d.dateExpiration, { message: "Aucune donnée à modifier." });

export const noteSchema = z.object({ note: noteField.optional() }).strict();
