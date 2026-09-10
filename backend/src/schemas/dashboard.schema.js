import { z } from "zod";
import { emptyToUndefined } from "../lib/zodHelpers.js";
import { dateField, dateRangeEndField } from "../lib/dateField.js";
import { PERIODES } from "../lib/period.js";

// Vérifie from <= to APRÈS transformation Zod (dateRangeEndField peut déjà
// avoir décalé `to` au lendemain pour une entrée "date seule" — voir
// lib/dateField.js) : on compare les valeurs réellement utilisées pour le
// filtre, pas les chaînes brutes envoyées par le client.
function refinePeriodeOrdre(data, ctx) {
  if (data.from && data.to && data.from > data.to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "La date de fin ne peut pas être antérieure à la date de début.",
    });
  }
}

// Utilisé par summary, finances, commandes, clientes, modeles — `period`
// (préréglage) et `from`/`to` (période personnalisée) sont mutuellement
// disponibles ; from/to explicites sont prioritaires (voir lib/period.js).
export const periodQuerySchema = z
  .object({
    period: z.preprocess(emptyToUndefined, z.enum(PERIODES).optional()),
    from: z.preprocess(emptyToUndefined, dateField.optional()),
    to: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  })
  .strict()
  .superRefine(refinePeriodeOrdre);

// Évolution : pas de préréglage `period` (une tendance porte sur une plage,
// pas un instantané) — uniquement from/to, bornés par défaut à 12 mois
// glissants côté route (voir lib/period.js#defaultEvolutionRange).
export const evolutionQuerySchema = z
  .object({
    from: z.preprocess(emptyToUndefined, dateField.optional()),
    to: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  })
  .strict()
  .superRefine(refinePeriodeOrdre);

export const recentQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  })
  .strict();

export const enRetardQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const aLivrerQuerySchema = z
  .object({
    horizonJours: z.coerce.number().int().min(1).max(90).optional().default(7),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();
