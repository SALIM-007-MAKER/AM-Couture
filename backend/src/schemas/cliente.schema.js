import { z } from "zod";
import { normalizePhone } from "../lib/phone.js";

// undefined/"" traités comme "champ non fourni" pour tous les champs optionnels
// (un formulaire frontend envoie souvent "" plutôt que d'omettre la clé).
const emptyToUndefined = (v) => (v === "" || v === null || v === undefined ? undefined : v);

function normalizeText(v) {
  return v.trim().replace(/\s+/g, " ");
}

const nameField = z.string().trim().min(1, "Champ requis.").max(120).transform(normalizeText);

const phoneField = z
  .string()
  .trim()
  .min(1, "Numéro de téléphone requis.")
  .transform(normalizePhone)
  .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide (8 à 15 chiffres attendus).");

const optionalPhoneField = z.preprocess(emptyToUndefined, phoneField.optional());

const optionalTrimmed = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).transform(normalizeText).optional());

const sexeField = z.preprocess(emptyToUndefined, z.enum(["FEMME", "HOMME", "AUTRE"]).optional());

// Un même numéro ne doit pas servir à la fois de téléphone principal et secondaire
// sur une même fiche — garde-fou simple contre la saisie en double dans un même formulaire.
function refineDistinctPhones(data, ctx) {
  if (data.telephone && data.telephone2 && data.telephone === data.telephone2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["telephone2"],
      message: "Le second numéro doit être différent du numéro principal.",
    });
  }
}

export const createClienteSchema = z
  .object({
    nom: nameField,
    prenom: nameField,
    telephone: phoneField,
    telephone2: optionalPhoneField,
    adresse: optionalTrimmed(255),
    sexe: sexeField,
    notes: optionalTrimmed(2000),
  })
  .strict()
  .superRefine(refineDistinctPhones);

export const updateClienteSchema = z
  .object({
    nom: nameField.optional(),
    prenom: nameField.optional(),
    telephone: phoneField.optional(),
    telephone2: optionalPhoneField,
    adresse: optionalTrimmed(255),
    sexe: sexeField,
    notes: optionalTrimmed(2000),
  })
  .strict()
  .superRefine(refineDistinctPhones)
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const listClientesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  archived: z.enum(["true", "false", "all"]).optional().default("false"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
