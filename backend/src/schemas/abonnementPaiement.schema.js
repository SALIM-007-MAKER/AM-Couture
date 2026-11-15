import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed } from "../lib/zodHelpers.js";

// Moyens qu'un atelier peut DÉCLARER. WAVE en est exclu : un paiement Wave n'existe que s'il est confirmé par
// Wave lui-même (webhook signé + relecture serveur), jamais sur la déclaration d'un atelier.
export const MOYENS_DECLARABLES = ["MOBILE_MONEY", "NITA", "AMANA", "VIREMENT", "ESPECES", "AUTRE"];

export const souscrireSchema = z
  .object({
    planId: z.string().trim().min(1, "Formule requise."),
    dureeMois: z.number().int().min(1, "Durée invalide.").max(60, "60 mois maximum."),
    moyenPaiement: z.enum(MOYENS_DECLARABLES, { error: "Moyen de paiement invalide." }),
    operateur: optionalTrimmed(60),
    // Référence de la transaction chez l'opérateur ou la banque : c'est ce que le SUPERADMIN rapproche de son relevé.
    reference: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(3, "Référence trop courte.").max(120).transform(normalizeText).optional(),
    ),
    preuveNote: optionalTrimmed(500),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.moyenPaiement !== "ESPECES" && !d.reference) {
      ctx.addIssue({ code: "custom", path: ["reference"], message: "Indiquez la référence du paiement." });
    }
  });

export const motifSchema = z
  .object({ motif: z.string().trim().min(3, "Motif requis (3 caractères minimum).").max(500).transform(normalizeText) })
  .strict();

export const confirmerSchema = z.object({ note: optionalTrimmed(300) }).strict();

export const listTransactionsQuerySchema = z.object({
  statut: z.preprocess(
    emptyToUndefined,
    z.enum(["EN_ATTENTE", "REUSSIE", "ECHOUEE", "ANNULEE", "EXPIREE", "REMBOURSEE"]).optional(),
  ),
  atelierId: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(60).optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const parametresAbonnementSchema = z
  .object({ joursGrace: z.number().int().min(0, "0 minimum.").max(90, "90 maximum.") })
  .strict();

export const suspensionSchema = z
  .object({ note: z.string().trim().min(3, "Motif requis.").max(300).transform(normalizeText) })
  .strict();
