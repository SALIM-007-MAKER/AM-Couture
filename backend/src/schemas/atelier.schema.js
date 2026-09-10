import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed, optionalImageField } from "../lib/zodHelpers.js";
import { normalizePhone } from "../lib/phone.js";

const nomField = z.string().trim().min(1, "Nom de l'atelier requis.").max(150).transform(normalizeText);

// Atelier.devise n'est PAS un enum Prisma (juste `String @default("FCFA")`) —
// validée comme chaîne libre, comme Depense.categorie : aucun enum de
// devises inventé au-delà de ce que le schéma prévoit réellement.
const deviseField = z.string().trim().min(1, "Devise requise.").max(10).transform(normalizeText);

const optionalPhoneField = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide (8 à 15 chiffres attendus).")
    .optional(),
);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const recuConfigValueSchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

// Même piège que "autres" (mesure.schema.js) : z.record() affecte
// `résultat[clé] = valeur`, ce qui fait silencieusement disparaître une clé
// "__proto__" (accesseur spécial d'Object.prototype) au lieu de la stocker
// ou de la rejeter. On valide donc les clés sur l'objet BRUT, en amont du
// .record(), avant qu'il n'y touche.
function checkRecuConfigRaw(raw, ctx) {
  const value = emptyToUndefined(raw);
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "recuConfig doit être un objet." });
    return z.NEVER;
  }
  const keys = Object.keys(value);
  if (keys.length > 20) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Trop de clés dans recuConfig (20 maximum)." });
    return z.NEVER;
  }
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clé "${key}" interdite.` });
      return z.NEVER;
    }
    if (key.length > 60) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clé "${key}" trop longue (60 caractères maximum).` });
      return z.NEVER;
    }
  }
  return value;
}

// Structure interne volontairement NON figée : le schéma Prisma ne définit
// aucune forme pour ce Json (pas de champs attendus). Décision produit :
// objet plat {clé: valeur simple} affiché tel quel sur le PDF du reçu (voir
// lib/recuPdf.js) — la clé (choisie librement par l'atelier : "Orange
// Money", "Mentions légales", etc.) porte le sens, le backend ne
// l'interprète jamais. Borné en taille/profondeur ci-dessous.
const recuConfigField = z.preprocess(checkRecuConfigRaw, z.record(z.string(), recuConfigValueSchema).optional());

// .strict() rejette explicitement id / updatedAt : ces valeurs sont
// déterminées uniquement par le serveur, jamais acceptées depuis le corps
// de la requête.
//
// PUT crée la ligne singleton si elle n'existe pas encore (nom + devise
// obligatoires dans ce cas) ; si elle existe déjà, seuls les champs
// effectivement fournis sont écrits (même fusion partielle que PATCH pour
// les champs optionnels) — un PUT qui ne renvoie pas `logoUrl` par exemple
// n'efface donc PAS un logo déjà configuré. Ce choix délibéré évite qu'un
// simple oubli de champ dans le corps de la requête ne détruise
// silencieusement une configuration existante (voir rapport).
export const putParametresSchema = z
  .object({
    nom: nomField,
    devise: deviseField,
    logoUrl: optionalImageField(),
    telephone: optionalPhoneField,
    adresse: optionalTrimmed(255),
    slogan: optionalTrimmed(200),
    recuConfig: recuConfigField,
  })
  .strict();

export const patchParametresSchema = z
  .object({
    nom: nomField.optional(),
    devise: deviseField.optional(),
    logoUrl: optionalImageField(),
    telephone: optionalPhoneField,
    adresse: optionalTrimmed(255),
    slogan: optionalTrimmed(200),
    recuConfig: recuConfigField,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });
