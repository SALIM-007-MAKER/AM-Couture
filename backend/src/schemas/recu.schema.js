import { z } from "zod";
import { emptyToUndefined } from "../lib/zodHelpers.js";
import { dateField, dateRangeEndField } from "../lib/dateField.js";

// Un Reçu n'a AUCUN champ librement saisissable par le client : numero est
// généré atomiquement (Counter, voir lib/numero.js), commandeId/paiementId
// dérivent de l'URL, et montantPaye est toujours calculé côté serveur
// (montant exact du paiement lié, ou total encaissé à cet instant pour un
// reçu récapitulatif) — jamais accepté tel quel, pour ne pas permettre de
// falsifier un document financier. .strict() sur un objet vide : toute clé
// envoyée dans le corps de la requête est donc explicitement rejetée.
export const createRecuSchema = z.object({}).strict();

export const listRecusQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Liste GLOBALE (tous reçus, toutes commandes confondues, voir
// routes/recus.routes.js router top-level).
export const listRecusGlobalQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  dateFrom: z.preprocess(emptyToUndefined, dateField.optional()),
  dateTo: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
