import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";

// Doit rester synchronisé avec l'enum Prisma UniteStock (prisma/schema.prisma).
export const UNITES_STOCK = ["METRE", "PIECE", "KG", "LITRE", "ROULEAU", "PAQUET", "AUTRE"];

const nomField = z.string().trim().min(1, "Nom requis.").max(150).transform(normalizeText);
const categorieField = z.string().trim().min(1).max(80).transform(normalizeText);
const optionalCategorieField = z.preprocess(emptyToUndefined, categorieField.optional());

// maxIntegerDigits: 8, maxDecimals: 2 — aligné sur Decimal(10,2) du schéma,
// même borne que prixField (modele.schema.js).
const quantiteField = (label) =>
  decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0.01, max: 1_000_000, label });

const optionalSeuilField = z.preprocess(
  emptyToUndefined,
  decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0, max: 1_000_000, label: "Seuil d'alerte" }).optional(),
);
const optionalPrixUnitaireField = z.preprocess(
  emptyToUndefined,
  decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0.01, max: 10_000_000, label: "Prix unitaire" }).optional(),
);
// Convenance à la création uniquement : matérialisée comme un premier
// mouvement ENTREE (motif "Stock initial"), jamais comme un champ quantite
// écrit directement — voir lib/stock.js.
const optionalQuantiteInitiale = z.preprocess(emptyToUndefined, quantiteField("Quantité initiale").optional());

// .strict() : voir modele.schema.js — même convention (rejette id/quantite/
// archivedAt/timestamps, déterminés uniquement par le serveur).
export const createArticleStockSchema = z
  .object({
    nom: nomField,
    categorie: optionalCategorieField,
    unite: z.enum(UNITES_STOCK).default("PIECE"),
    seuilAlerte: optionalSeuilField,
    prixUnitaire: optionalPrixUnitaireField,
    notes: optionalTrimmed(2000),
    quantiteInitiale: optionalQuantiteInitiale,
  })
  .strict();

export const updateArticleStockSchema = z
  .object({
    nom: nomField.optional(),
    categorie: optionalCategorieField,
    unite: z.enum(UNITES_STOCK).optional(),
    seuilAlerte: optionalSeuilField,
    prixUnitaire: optionalPrixUnitaireField,
    notes: optionalTrimmed(2000),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const listArticlesStockQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  categorie: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
  archived: z.enum(["true", "false", "all"]).optional().default("false"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createMouvementStockSchema = z
  .object({
    type: z.enum(["ENTREE", "SORTIE"]),
    quantite: quantiteField("Quantité"),
    motif: optionalTrimmed(300),
  })
  .strict();

export const listMouvementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
