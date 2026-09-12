import { z } from "zod";

export const MOYENS_PAIEMENT = ["WAVE", "NITA", "AMANA"];

// referenceExterne obligatoire pour NITA/AMANA (référence du transfert que
// l'atelier a déjà reçu sur son propre compte, à vérifier manuellement —
// voir audit Phase 6 : aucune API publique exploitable pour ces deux-là)
// mais absente pour WAVE, où c'est Wave qui génère l'identifiant de session
// (voir lib/wave.js) : rien à saisir côté atelier avant paiement.
export const creerAbonnementSchema = z
  .object({
    formuleId: z.string().trim().min(1, "Formule requise."),
    moyenPaiement: z.enum(MOYENS_PAIEMENT),
    referenceExterne: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.moyenPaiement !== "WAVE" && !data.referenceExterne) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceExterne"],
        message: "Référence du transfert requise pour ce moyen de paiement.",
      });
    }
  });

export const listAbonnementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
