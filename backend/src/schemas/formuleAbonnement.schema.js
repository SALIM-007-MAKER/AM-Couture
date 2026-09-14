import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";
import { decimalField } from "../lib/decimalField.js";

// Gestion des formules d'abonnement par le SUPERADMIN (voir
// formulesAbonnement.routes.js) — jusqu'ici en lecture seule (prix modifiés
// à la main dans la base, voir commentaire historique du fichier de routes).
// dureeMois n'est PAS modifiable après création (@unique en base, et change
// la signification même de la formule — un "1 mois" qui deviendrait "3 mois"
// serait une nouvelle formule, pas une édition de l'existante).
const nomField = z.string().trim().min(1, "Nom requis.").max(50).transform(normalizeText);
const dureeMoisField = z.number().int().min(1, "Durée invalide.").max(60);
const montantField = decimalField({
  maxIntegerDigits: 8, // aligné sur Decimal(10,2) du schéma (FormuleAbonnement.prix)
  maxDecimals: 2,
  min: 0.01,
  max: 10_000_000, // même borne que Depense/Paiement/Commande
  label: "Prix",
});

export const creerFormuleSchema = z
  .object({
    dureeMois: dureeMoisField,
    nom: nomField,
    prix: montantField,
  })
  .strict();

export const patchFormuleSchema = z
  .object({
    nom: nomField.optional(),
    prix: montantField.optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });
