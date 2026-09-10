import { z } from "zod";

/**
 * Fabrique un schéma Zod pour un champ Decimal Prisma (prix, montant, mesure...).
 * Accepte number ou string en entrée mais ne transite jamais par un flottant
 * intermédiaire une fois validé : la valeur retenue est une chaîne décimale
 * canonique, passée telle quelle à Prisma (colonne Decimal), pour que le
 * driver écrive exactement ce qui a été saisi — aucun arrondi flottant
 * supplémentaire, aucune perte de précision.
 *
 * Réutilisable par tout futur module manipulant un Decimal (Commande,
 * Paiement...) — voir mesure.schema.js pour l'implémentation d'origine dont
 * ceci est la généralisation (non rétro-appliquée à Mesure, déjà validé).
 */
export function decimalField({ maxIntegerDigits, maxDecimals = 2, min, max, label = "Valeur" }) {
  const pattern = new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,${maxDecimals}})?$`);

  return z.union([z.number(), z.string()]).transform((v, ctx) => {
    let str;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} : valeur numérique invalide.` });
        return z.NEVER;
      }
      str = v.toString();
    } else {
      str = v.trim();
    }
    if (!pattern.test(str)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} invalide : nombre positif attendu (max ${maxDecimals} décimales).`,
      });
      return z.NEVER;
    }
    const num = Number(str);
    if (num < min || num > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} hors limites raisonnables (entre ${min} et ${max}).`,
      });
      return z.NEVER;
    }
    return str;
  });
}
