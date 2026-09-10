import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";

// Partagé par Paiement, Dépense et Livraison — même forme, même règle : un
// motif est TOUJOURS exigé (jamais d'annulation silencieuse, la trace doit
// expliquer pourquoi). .strict() rejette tout autre champ (aucune donnée
// système acceptée depuis le body).
export const annulerSchema = z
  .object({
    motif: z.string().trim().min(3, "Motif requis (3 caractères minimum).").max(500).transform(normalizeText),
  })
  .strict();
