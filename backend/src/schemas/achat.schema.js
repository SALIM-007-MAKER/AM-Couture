import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";
import { dateField } from "../lib/dateField.js";

const idRef = z.string().trim().min(1, "Identifiant requis.");

const quantiteField = decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0.01, max: 1_000_000, label: "Quantité" });
const prixField = decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0, max: 10_000_000, label: "Prix unitaire" });

/** Plafond du total d'un achat : celui d'une dépense (le paiement crée une dépense du même montant). */
export const TOTAL_ACHAT_MAX = 10_000_000;

export const ligneAchatSchema = z.object({ articleId: idRef, quantite: quantiteField, prixUnitaire: prixField }).strict();

// .strict() : numero / statut / dépense / dates système sont déterminés par le serveur uniquement.
export const createAchatSchema = z
  .object({
    fournisseurId: idRef,
    dateAttendue: z.preprocess(emptyToUndefined, dateField.optional()),
    notes: optionalTrimmed(2000),
    lignes: z.array(ligneAchatSchema).min(1, "Au moins une ligne est requise.").max(50, "50 lignes maximum."),
  })
  .strict()
  .superRefine((data, ctx) => {
    const vus = new Set();
    data.lignes.forEach((l, i) => {
      if (vus.has(l.articleId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lignes", i, "articleId"], message: "Cet article figure déjà dans l'achat." });
      }
      vus.add(l.articleId);
    });
  });

// Seuls la date attendue et les notes se modifient après création (les lignes et les prix, jamais : annuler et recréer).
export const updateAchatSchema = z
  .object({
    dateAttendue: z.preprocess((v) => (v === "" ? null : v), dateField.nullable().optional()),
    notes: optionalTrimmed(2000),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const receptionSchema = z
  .object({
    lignes: z
      .array(z.object({ ligneId: idRef, quantite: quantiteField }).strict())
      .min(1, "Indiquez au moins une quantité reçue.")
      .max(50),
  })
  .strict()
  .superRefine((data, ctx) => {
    const vus = new Set();
    data.lignes.forEach((l, i) => {
      if (vus.has(l.ligneId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lignes", i, "ligneId"], message: "Ligne en double." });
      vus.add(l.ligneId);
    });
  });

// Paiement : la date est facultative (par défaut maintenant) ; le montant est TOUJOURS le total de l'achat.
export const paiementAchatSchema = z.object({ date: z.preprocess(emptyToUndefined, dateField.optional()) }).strict();

export const listAchatsQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  statut: z.preprocess(emptyToUndefined, z.enum(["COMMANDE", "ANNULE"]).optional()),
  reception: z.preprocess(emptyToUndefined, z.enum(["attendu", "complete"]).optional()),
  paiement: z.preprocess(emptyToUndefined, z.enum(["paye", "nonpaye"]).optional()),
  fournisseurId: z.preprocess(emptyToUndefined, idRef.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
