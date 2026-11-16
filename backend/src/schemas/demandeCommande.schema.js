import { z } from "zod";
import { emptyToUndefined, optionalTrimmed, normalizeText } from "../lib/zodHelpers.js";
import { normalizePhone } from "../lib/phone.js";

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

const nomVisiteur = z.string().trim().min(1, "Champ requis.").max(60, "60 caractères maximum.").transform(normalizeText);
const telephoneVisiteur = z
  .string()
  .trim()
  .min(1, "Numéro de téléphone requis.")
  .transform(normalizePhone)
  .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide (8 à 15 chiffres attendus).");

// Envoyée par un VISITEUR sans compte depuis la vitrine (7.3). Jamais de prix, de date ni de statut : ce n'est qu'une
// proposition. `consentement` doit être EXACTEMENT true (case cochée par la personne). `siteWeb` est un piège à robots :
// invisible pour une personne, toujours vide ; rempli, la demande est ignorée sans le dire.
export const creerDemandePubliqueSchema = z
  .object({
    prenom: nomVisiteur,
    nom: nomVisiteur,
    telephone: telephoneVisiteur,
    modeleId: z.preprocess(emptyToUndefined, idRefField.optional()),
    description: optionalTrimmed(1000),
    consentement: z.literal(true, { errorMap: () => ({ message: "Votre accord est nécessaire pour transmettre votre demande à l'atelier." }) }),
    siteWeb: z.string().max(200).optional(),
  })
  .strict();
