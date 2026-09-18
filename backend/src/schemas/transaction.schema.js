import { z } from "zod";

// Résultats simulables depuis la page de test (mode mock uniquement, voir
// POST /api/transactions/:id/simuler-mock) — couvre exactement les issues
// possibles d'un vrai paiement à vérification automatique (voir
// statuts_transaction_etendus, schema.prisma) : REUSSIE n'est volontairement
// pas nommée "reussi" ici pour rester alignée sur StatutTransaction, jamais
// une nomenclature parallèle.
export const RESULTATS_SIMULABLES = ["REUSSIE", "ECHOUEE", "ANNULEE", "EXPIREE"];

export const simulerResultatSchema = z
  .object({ resultat: z.enum(RESULTATS_SIMULABLES) })
  .strict();
