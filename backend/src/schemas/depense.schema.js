import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed, optionalUrlField } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";
import { dateField, dateRangeEndField } from "../lib/dateField.js";

// Depense.categorie est une chaîne libre dans le schéma (pas d'enum Prisma) —
// on ne transforme donc pas arbitrairement le modèle en enum : simple
// validation de chaîne (trim, longueur), comme demandé.
const categorieField = z.string().trim().min(1, "Catégorie requise.").max(60).transform(normalizeText);

const montantField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma
  maxDecimals: 2,
  min: 0.01,
  max: 10_000_000, // borne applicative raisonnable, cohérente avec Paiement/Commande
  label: "Montant de la dépense",
});

// .strict() : rejette explicitement id / createdAt / tout champ système —
// ces valeurs sont déterminées uniquement par le serveur, jamais acceptées
// depuis le corps de la requête. Pas de PATCH/DELETE pour ce modèle (voir
// rapport) : ce schéma de création est le seul point d'entrée.
export const createDepenseSchema = z
  .object({
    categorie: categorieField,
    montant: montantField,
    // Optionnelle : si fournie, utilisée telle quelle (jamais remplacée
    // silencieusement par "maintenant") ; sinon Prisma applique son défaut (now()).
    date: z.preprocess(emptyToUndefined, dateField.optional()),
    description: optionalTrimmed(2000),
    justificatifUrl: optionalUrlField(),
  })
  .strict();

export const listDepensesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  categorie: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(60).optional()),
  dateFrom: z.preprocess(emptyToUndefined, dateField.optional()),
  // "toute la journée" : voir dateRangeEndField (lib/dateField.js) pour la
  // convention exacte retenue sur la borne de fin.
  dateTo: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Mêmes filtres que la liste (hors pagination) pour /stats — permet des
// statistiques bornées à une période/catégorie, calculées en base.
export const statsDepensesQuerySchema = z.object({
  categorie: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(60).optional()),
  dateFrom: z.preprocess(emptyToUndefined, dateField.optional()),
  dateTo: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
});
