import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed, optionalImageField } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";

// Doit rester synchronisé avec l'enum Prisma CategorieVetement (prisma/schema.prisma).
export const CATEGORIES_VETEMENT = [
  "ROBE",
  "BOUBOU",
  "ENSEMBLE",
  "PANTALON",
  "CHEMISE",
  "JUPE",
  "KAFTAN",
  "COSTUME",
  "TENUE_TRADITIONNELLE",
  "AUTRE",
];

const nomField = z.string().trim().min(1, "Nom requis.").max(150).transform(normalizeText);

const prixField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma
  maxDecimals: 2,
  min: 0.01,
  max: 10_000_000, // borne applicative raisonnable, bien en-deçà du plafond de la colonne
  label: "Prix indicatif",
});
const optionalPrixField = z.preprocess(emptyToUndefined, prixField.optional());

// .strict() : rejette explicitement id / archivedAt / createdAt / updatedAt /
// commandes — ces valeurs sont déterminées uniquement par le serveur, jamais
// acceptées depuis le corps de la requête.
export const createModeleSchema = z
  .object({
    nom: nomField,
    categorie: z.enum(CATEGORIES_VETEMENT),
    description: optionalTrimmed(2000),
    prixIndicatif: optionalPrixField,
    photoUrl: optionalImageField(),
  })
  .strict();

export const updateModeleSchema = z
  .object({
    nom: nomField.optional(),
    categorie: z.enum(CATEGORIES_VETEMENT).optional(),
    description: optionalTrimmed(2000),
    prixIndicatif: optionalPrixField,
    photoUrl: optionalImageField(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const listModelesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  categorie: z.preprocess(emptyToUndefined, z.enum(CATEGORIES_VETEMENT).optional()),
  archived: z.enum(["true", "false", "all"]).optional().default("false"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
