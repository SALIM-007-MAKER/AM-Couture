import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";
import { dateField, dateRangeEndField } from "../lib/dateField.js";
import { createPaiementSchema as paiementFinalSchema } from "./paiement.schema.js";

// .strict() : rejette explicitement id / commandeId / montantRestant /
// createdAt — montantRestant est un snapshot calculé UNIQUEMENT côté serveur
// (voir routes/livraisons.routes.js), jamais accepté depuis le body : ce
// champ n'apparaît même pas dans ce schéma, donc toute tentative d'envoi est
// rejetée comme clé inconnue plutôt que silencieusement ignorée.
export const createLivraisonSchema = z
  .object({
    dateLivraison: z.preprocess(emptyToUndefined, dateField.optional()),
    commentaire: optionalTrimmed(500),
    // Paiement final optionnel réglé au moment du retrait — même forme et
    // mêmes règles qu'un paiement normal (créé dans la même transaction que
    // la livraison, voir routes/livraisons.routes.js).
    paiementFinal: z.preprocess(emptyToUndefined, paiementFinalSchema.optional()),
  })
  .strict();

export const listLivraisonsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Liste GLOBALE (toutes commandes confondues, voir routes/livraisons.routes.js
// livraisonsGlobalRouter).
export const listLivraisonsGlobalQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  dateFrom: z.preprocess(emptyToUndefined, dateField.optional()),
  dateTo: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
