import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";

const idRefField = z.string().trim().min(1, "Identifiant requis.");

// Créée par le USER (voir routes/moi.routes.js) — jamais de prix, de dates
// ni de statut acceptés depuis le client : ce ne sont que des PROPOSITIONS,
// l'ADMIN décide entièrement des termes réels en acceptant (voir
// routes/demandes.routes.js, qui crée alors une vraie Commande).
export const creerDemandeSchema = z
  .object({
    modeleId: z.preprocess(emptyToUndefined, idRefField.optional()),
    description: optionalTrimmed(2000),
  })
  .strict();

export const refuserDemandeSchema = z
  .object({
    motifRefus: optionalTrimmed(500),
  })
  .strict();

// Accepter une demande NE CRÉE PAS la Commande ici : l'ADMIN la crée
// d'abord via le flux normal POST /api/commandes (déjà entièrement validé —
// prix, dates, modèle...), puis relie cette Commande à la demande via cet
// id. Évite de dupliquer toute la validation de création de commande pour
// un second chemin d'écriture.
export const accepterDemandeSchema = z
  .object({
    commandeId: idRefField,
  })
  .strict();

export const listDemandesQuerySchema = z.object({
  statut: z.preprocess(emptyToUndefined, z.enum(["EN_ATTENTE", "ACCEPTEE", "REFUSEE"]).optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
