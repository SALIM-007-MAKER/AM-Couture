import { z } from "zod";
import { emptyToUndefined, optionalTrimmed } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";
import { dateField } from "../lib/dateField.js";
import { CATEGORIES_VETEMENT } from "./modele.schema.js";
import { createPaiementSchema as paiementInitialSchema } from "./paiement.schema.js";

export const STATUTS_COMMANDE = [
  "NOUVELLE",
  "EN_CONFECTION",
  "ESSAYAGE",
  "RETOUCHES",
  "TERMINEE",
  "LIVREE",
  "ANNULEE",
];

export const PRIORITES = ["NORMALE", "URGENTE"];

/**
 * Machine à états du statut de commande. Toute transition absente de cette
 * table est refusée (409) — pas de workflow inventé au-delà de ce que
 * l'enum Prisma StatutCommande prévoit. LIVREE et ANNULEE sont terminaux ;
 * TERMINEE ne peut avancer que vers LIVREE (ou être annulée), jamais revenir
 * en arrière automatiquement.
 */
export const STATUT_TRANSITIONS = {
  NOUVELLE: ["EN_CONFECTION", "ANNULEE"],
  EN_CONFECTION: ["ESSAYAGE", "ANNULEE"],
  ESSAYAGE: ["RETOUCHES", "TERMINEE", "ANNULEE"],
  RETOUCHES: ["ESSAYAGE", "TERMINEE", "ANNULEE"],
  TERMINEE: ["LIVREE", "ANNULEE"],
  LIVREE: [],
  ANNULEE: [],
};

const MONTANT_MAX = 10_000_000; // borne applicative raisonnable (FCFA), cohérente avec Modele.prixIndicatif

const prixTotalField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma
  maxDecimals: 2,
  min: 0.01,
  max: MONTANT_MAX,
  label: "Prix total",
});

const idRefField = z.string().trim().min(1, "Identifiant requis.");

// paiementInitialSchema = createPaiementSchema (paiement.schema.js), importé
// sous cet alias : même forme, même validation qu'un paiement créé via
// POST /api/commandes/:commandeId/paiements — une seule source de vérité.

// .strict() : rejette explicitement id / numero / statut / createdAt /
// updatedAt / relations — ces valeurs sont déterminées uniquement par le
// serveur (numéro via Counter, statut via la route dédiée), jamais acceptées
// depuis le corps de la requête.
export const createCommandeSchema = z
  .object({
    clienteId: idRefField,
    modeleId: z.preprocess(emptyToUndefined, idRefField.optional()),
    typeVetement: z.enum(CATEGORIES_VETEMENT),
    description: optionalTrimmed(2000),
    couleur: optionalTrimmed(100),
    tissu: optionalTrimmed(100),
    quantite: z.number().int().min(1).max(50).optional().default(1),
    prixTotal: prixTotalField,
    priorite: z.enum(PRIORITES).optional().default("NORMALE"),
    dateCommande: z.preprocess(emptyToUndefined, dateField.optional()),
    dateLivraisonPrevue: dateField,
    observations: optionalTrimmed(2000),
    paiementInitial: z.preprocess(emptyToUndefined, paiementInitialSchema.optional()),
  })
  .strict()
  .superRefine((data, ctx) => {
    const effectiveDateCommande = data.dateCommande ?? new Date();
    if (data.dateLivraisonPrevue < effectiveDateCommande) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateLivraisonPrevue"],
        message: "La date de livraison prévue ne peut pas être antérieure à la date de commande.",
      });
    }
    if (data.paiementInitial) {
      const montant = Number(data.paiementInitial.montant);
      const total = Number(data.prixTotal);
      if (montant > total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paiementInitial", "montant"],
          message: "Le paiement initial ne peut pas dépasser le prix total.",
        });
      }
    }
  });

// modeleId nullable explicite : "" ou null détachent le modèle, undefined =
// champ non touché. Les autres champs "protégés" (clienteId, prixTotal,
// statut, dateCommande, numero, id, timestamps) sont volontairement absents
// de ce schéma : .strict() les rejette s'ils sont envoyés (voir §10 des
// consignes — jamais modifiables via ce PATCH générique).
export const updateCommandeSchema = z
  .object({
    modeleId: z.preprocess((v) => (v === "" ? null : v), idRefField.nullable().optional()),
    typeVetement: z.enum(CATEGORIES_VETEMENT).optional(),
    description: optionalTrimmed(2000),
    couleur: optionalTrimmed(100),
    tissu: optionalTrimmed(100),
    quantite: z.number().int().min(1).max(50).optional(),
    priorite: z.enum(PRIORITES).optional(),
    dateLivraisonPrevue: dateField.optional(),
    observations: optionalTrimmed(2000),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

export const changeStatutSchema = z.object({ statut: z.enum(STATUTS_COMMANDE) }).strict();

export const listCommandesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  statut: z.preprocess(emptyToUndefined, z.enum(STATUTS_COMMANDE).optional()),
  priorite: z.preprocess(emptyToUndefined, z.enum(PRIORITES).optional()),
  clienteId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  livraisonDu: z.preprocess(emptyToUndefined, dateField.optional()),
  livraisonAu: z.preprocess(emptyToUndefined, dateField.optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
