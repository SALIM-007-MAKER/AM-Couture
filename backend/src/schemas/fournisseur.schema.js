import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed } from "../lib/zodHelpers.js";

const nomField = z.string().trim().min(1, "Nom requis.").max(150).transform(normalizeText);
const telephoneField = z.preprocess(emptyToUndefined, z.string().trim().min(5, "Téléphone invalide.").max(30, "Téléphone invalide.").regex(/^[0-9+()\-. ]+$/, "Téléphone invalide.").optional());
const emailField = z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email("Email invalide.").max(190).optional());

// .strict() : id / archivedAt / timestamps sont déterminés par le serveur uniquement.
export const createFournisseurSchema = z
  .object({
    nom: nomField,
    contact: optionalTrimmed(150),
    telephone: telephoneField,
    email: emailField,
    adresse: optionalTrimmed(300),
    notes: optionalTrimmed(2000),
  })
  .strict();

export const updateFournisseurSchema = z
  .object({
    nom: nomField.optional(),
    contact: optionalTrimmed(150),
    telephone: telephoneField,
    email: emailField,
    adresse: optionalTrimmed(300),
    notes: optionalTrimmed(2000),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const listFournisseursQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  archived: z.enum(["true", "false", "all"]).optional().default("false"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
