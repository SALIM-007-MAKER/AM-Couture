import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";

// Plans d'abonnement de la plateforme (Essentiel, Professionnel...), gérés
// par le SUPERADMIN — voir plans.routes.js. Prix MENSUEL ; la durée d'un
// abonnement est choisie à l'activation (voir ateliersAbonnement.routes.js).
const nomField = z.string().trim().min(1, "Nom requis.").max(50).transform(normalizeText);
const descriptionField = z.string().trim().max(300).transform(normalizeText);
const prixField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma
  maxDecimals: 2,
  min: 0,
  max: 10_000_000,
  label: "Prix mensuel",
});
// Une fonctionnalité = une ligne courte ; max 20 par plan.
const fonctionnalitesField = z
  .array(z.string().trim().min(1).max(120).transform(normalizeText))
  .max(20, "20 fonctionnalités maximum.");

// Durées proposées avec remise (voir lib/abonnement.js). Durées uniques.
const tarifsDureeField = z
  .array(
    z
      .object({
        dureeMois: z.number().int().min(1, "Durée invalide.").max(60, "60 mois maximum."),
        remisePourcent: z.number().min(0, "Remise invalide.").max(90, "90 % maximum.").multipleOf(0.01),
      })
      .strict(),
  )
  .max(8, "8 durées maximum.")
  .refine((l) => new Set(l.map((t) => t.dureeMois)).size === l.length, "Chaque durée ne peut apparaître qu'une fois.");

export const creerPlanSchema = z
  .object({
    nom: nomField,
    description: descriptionField.optional(),
    prixMensuel: prixField,
    fonctionnalites: fonctionnalitesField.optional().default([]),
    tarifsDuree: tarifsDureeField.optional().default([]),
    ordre: z.number().int().min(0).max(999).optional().default(0),
  })
  .strict();

export const patchPlanSchema = z
  .object({
    nom: nomField.optional(),
    description: descriptionField.nullable().optional(),
    prixMensuel: prixField.optional(),
    fonctionnalites: fonctionnalitesField.optional(),
    tarifsDuree: tarifsDureeField.optional(),
    ordre: z.number().int().min(0).max(999).optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });
