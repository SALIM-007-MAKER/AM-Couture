import { z } from "zod";

// Numéro WhatsApp de contact de la plateforme, affiché aux PDG (page
// Abonnement). Saisie libre (espaces, +, tirets acceptés) mais stocké en
// CHIFFRES SEULS avec l'indicatif du pays (format attendu par wa.me) ; vide ou
// null = aucun contact affiché.
export const contactSchema = z
  .object({
    whatsapp: z
      .string()
      .trim()
      .max(30)
      .nullable()
      .transform((v) => (v ? v.replace(/[\s+().-]/g, "") : null))
      .refine((v) => v === null || v === "" || /^[0-9]{8,15}$/.test(v), {
        message: "Numéro invalide : indiquez 8 à 15 chiffres avec l'indicatif du pays (ex : 221771234567).",
      })
      .transform((v) => (v ? v : null)),
  })
  .strict();
