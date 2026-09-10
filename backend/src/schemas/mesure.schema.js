import { z } from "zod";

const emptyToUndefined = (v) => (v === "" || v === null || v === undefined ? undefined : v);

// Bornes raisonnables pour une mesure corporelle humaine, en cm. Le champ
// Prisma est Decimal(6,2) (jusqu'à 9999.99) mais on reste bien plus strict
// ici pour écarter les valeurs absurdes.
const MAX_MESURE_CM = 300;
const MIN_MESURE_CM = 0.1;

const KNOWN_MESURE_FIELDS = new Set([
  "epaule",
  "poitrine",
  "taille",
  "hanches",
  "longueur",
  "longueurRobe",
  "longueurJupe",
  "longueurPantalon",
  "longueurManche",
  "tourBras",
  "tourCou",
  "tourPoignet",
  "tourCuisse",
  "tourGenou",
]);

/**
 * Champ décimal de mesure (cm). Accepte number ou string en entrée mais ne
 * transite jamais par un flottant intermédiaire une fois validé : la valeur
 * retenue est une chaîne décimale canonique, passée telle quelle à Prisma
 * (colonne Decimal) pour que le driver écrive exactement ce qui a été saisi,
 * sans arrondi flottant supplémentaire.
 */
const decimalMesureField = z.union([z.number(), z.string()]).transform((v, ctx) => {
  let str;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valeur numérique invalide." });
      return z.NEVER;
    }
    str = v.toString();
  } else {
    str = v.trim();
  }
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(str)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Valeur invalide : nombre positif attendu (max 2 décimales).",
    });
    return z.NEVER;
  }
  const num = Number(str);
  if (num < MIN_MESURE_CM || num > MAX_MESURE_CM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Valeur hors limites raisonnables (entre ${MIN_MESURE_CM} et ${MAX_MESURE_CM} cm).`,
    });
    return z.NEVER;
  }
  return str;
});

const optionalDecimalMesureField = z.preprocess(emptyToUndefined, decimalMesureField.optional());

function normalizeText(v) {
  return v.trim().replace(/\s+/g, " ");
}

const optionalTrimmed = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).transform(normalizeText).optional());

// Valeur libre dans "autres" : soit une mesure numérique (mêmes bornes que
// les champs structurés), soit un court libellé texte (ex: taille "3/4").
const autresValueSchema = z.union([
  z.number().finite().positive().max(MAX_MESURE_CM),
  z.string().trim().min(1).max(60),
]);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// IMPORTANT : z.record() construit son objet de sortie via une affectation
// `résultat[clé] = valeur` pour chaque clé. Pour une clé nommée "__proto__",
// cette affectation déclenche l'accesseur spécial d'Object.prototype au lieu
// de créer une propriété propre — la clé disparaît silencieusement du
// résultat (elle ne pollue rien, mais un superRefine placé APRÈS le
// .record() ne peut plus jamais la voir : elle a déjà disparu). On valide
// donc les clés sur l'objet BRUT, dans le preprocess, avant que .record()
// n'y touche.
function checkAutresRaw(raw, ctx) {
  const value = emptyToUndefined(raw);
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '"autres" doit être un objet.' });
    return z.NEVER;
  }
  const keys = Object.keys(value);
  if (keys.length > 20) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Trop de mesures libres (20 maximum)." });
    return z.NEVER;
  }
  for (const key of keys) {
    // "autres" est un espace libre pour des mesures NON prévues par le
    // schéma structuré : on interdit d'y glisser un champ connu (ex:
    // "poitrine") pour contourner ses propres bornes/validations.
    if (KNOWN_MESURE_FIELDS.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${key}" est un champ structuré : utilisez le champ dédié plutôt que "autres".`,
      });
      return z.NEVER;
    }
    if (FORBIDDEN_KEYS.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clé "${key}" interdite.` });
      return z.NEVER;
    }
  }
  return value;
}

const autresField = z.preprocess(
  checkAutresRaw,
  z.record(z.string().trim().min(1).max(60), autresValueSchema).optional(),
);

// .strict() rejette explicitement id / clienteId / createdAt / toute clé
// système : ces valeurs sont déterminées uniquement par le serveur (route +
// horodatage DB), jamais acceptées depuis le corps de la requête.
export const createMesureSchema = z
  .object({
    epaule: optionalDecimalMesureField,
    poitrine: optionalDecimalMesureField,
    taille: optionalDecimalMesureField,
    hanches: optionalDecimalMesureField,
    longueur: optionalDecimalMesureField,
    longueurRobe: optionalDecimalMesureField,
    longueurJupe: optionalDecimalMesureField,
    longueurPantalon: optionalDecimalMesureField,
    longueurManche: optionalDecimalMesureField,
    tourBras: optionalDecimalMesureField,
    tourCou: optionalDecimalMesureField,
    tourPoignet: optionalDecimalMesureField,
    tourCuisse: optionalDecimalMesureField,
    tourGenou: optionalDecimalMesureField,
    autres: autresField,
    notes: optionalTrimmed(2000),
  })
  .strict();

export const listMesuresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
