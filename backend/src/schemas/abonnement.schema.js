import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";

// Activation MANUELLE par le SUPERADMIN (voir ateliersAbonnement.routes.js) — aucune donnée de paiement ici : les
// paiements d'abonnement ont leurs propres schémas (abonnementPaiement.schema.js).
const dateField = z.coerce
  .date({ error: "Date invalide." })
  .refine((d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100, "Date invalide.");
const noteField = z.string().trim().max(300).transform(normalizeText);

// Deux modes d'activation :
//  - CATALOGUE : période mensuelle ou annuelle, au prix du catalogue (aucune durée ni prix saisis) ;
//  - EXCEPTIONNEL : durée (ou date d'expiration) ET montant saisis explicitement par le SUPERADMIN, avec un motif obligatoire.
//    Prix et durée sont figés dans l'abonnement, marqué `tarifExceptionnel`. Aucun prix n'est jamais déduit ou calculé.
const motifExceptionnel = z.string().trim().min(3, "Motif requis (3 caractères minimum).").max(300).transform(normalizeText);
const prixExceptionnel = z
  .number({ error: "Montant requis (nombre entier de FCFA)." })
  .int("Le montant doit être un entier (le franc CFA n'a pas de centimes).")
  .min(1, "Le montant doit être supérieur à zéro.")
  .max(99_999_999, "Montant trop élevé.");

export const activerAbonnementSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("CATALOGUE"),
      planId: z.string().trim().min(1, "Plan requis."),
      periodicite: z.enum(["MENSUEL", "ANNUEL"], { error: "Période invalide." }),
      dateDebut: dateField.optional(),
      note: noteField.optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("EXCEPTIONNEL"),
      planId: z.string().trim().min(1, "Plan requis."),
      dateDebut: dateField.optional(),
      // Soit une durée en mois (date d'expiration calculée), soit une date d'expiration explicite — au moins l'une des deux.
      dureeMois: z.number().int().min(1, "Durée invalide.").max(60, "60 mois maximum.").optional(),
      dateExpiration: dateField.optional(),
      prix: prixExceptionnel,
      note: motifExceptionnel,
    })
    .strict()
    .refine((d) => d.dureeMois || d.dateExpiration, { path: ["dureeMois"], message: "Indiquez une durée ou une date d'expiration." }),
]);

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
