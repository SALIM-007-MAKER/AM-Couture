import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";
import { lisibleSurBlanc } from "../lib/contraste.js";
import { CATEGORIES_VETEMENT } from "./modele.schema.js";

/** Mots qui ne peuvent pas être un identifiant d'atelier (routes de l'application, confusions possibles). */
export const SLUGS_RESERVES = new Set([
  "admin", "api", "app", "login", "inscription", "client", "a", "www", "static", "assets", "ateliers", "vitrine", "compte", "parametres", "support",
]);

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "3 caractères minimum.")
  .max(40, "40 caractères maximum.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets seulement (pas de tiret au début, à la fin ni doublé).")
  .refine((v) => !SLUGS_RESERVES.has(v), { message: "Cet identifiant est réservé." });

const couleurField = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB.")
  .transform((v) => v.toLowerCase())
  .refine(lisibleSurBlanc, { message: "Couleur trop claire : un texte blanc n'y serait pas lisible. Choisissez une teinte plus foncée." });

// null efface la valeur ; une chaîne vide aussi.
const nullable = (champ) => z.preprocess((v) => (v === "" ? null : v), champ.nullable().optional());

// .strict() : aucun champ système (id, atelierId, nom…) n'est accepté ici.
export const patchVitrineSchema = z
  .object({
    slug: slugField.optional(),
    vitrineActive: z.boolean().optional(),
    vitrineDescription: nullable(z.string().trim().max(1500)),
    couleurPrincipale: nullable(couleurField),
    vitrineContact: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "Aucune donnée à modifier." });

export const listVitrineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(24),
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(60).optional()),
  categorie: z.preprocess(emptyToUndefined, z.enum(CATEGORIES_VETEMENT).optional()),
  tag: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(30).optional()),
});

export { optionalTrimmed };
