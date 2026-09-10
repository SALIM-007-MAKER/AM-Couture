import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";
import { dateField, dateRangeEndField } from "../lib/dateField.js";

// Doit rester synchronisé avec l'enum Prisma ModePaiement (prisma/schema.prisma).
export const MODES_PAIEMENT = ["ESPECES", "MOBILE_MONEY", "VIREMENT", "AUTRE"];

const MONTANT_MAX = 10_000_000; // borne applicative raisonnable (FCFA), cohérente avec Commande.prixTotal

export const montantPaiementField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma
  maxDecimals: 2,
  min: 0.01,
  max: MONTANT_MAX,
  label: "Montant du paiement",
});

// .strict() : rejette explicitement id / commandeId / date / createdAt / recu
// — commandeId vient exclusivement du paramètre d'URL (route imbriquée), le
// reste est déterminé uniquement par le serveur. Réutilisé tel quel par
// commande.schema.js pour le paiement initial (une seule source de vérité
// pour la forme d'un paiement).
export const createPaiementSchema = z
  .object({
    montant: montantPaiementField,
    mode: z.enum(MODES_PAIEMENT),
    reference: optionalTrimmed(120),
    commentaire: optionalTrimmed(500),
  })
  .strict();

export const listPaiementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Liste GLOBALE (toutes commandes confondues, voir routes/paiements.routes.js
// paiementsGlobalRouter) — filtres supplémentaires impossibles/inutiles sur
// la liste imbriquée ci-dessus (déjà scopée à une commande précise).
export const listPaiementsGlobalQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  mode: z.preprocess(emptyToUndefined, z.enum(MODES_PAIEMENT).optional()),
  dateFrom: z.preprocess(emptyToUndefined, dateField.optional()),
  dateTo: z.preprocess(emptyToUndefined, dateRangeEndField.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
