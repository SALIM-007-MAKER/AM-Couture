import { z } from "zod";
import { normalizeText } from "../lib/zodHelpers.js";
import { LIMITE_MIN, LIMITE_MAX } from "../lib/quotas.js";
import { PRIX_MIN, PRIX_MAX } from "../lib/tarifs.js";

// Plans d'abonnement de la plateforme (Essentiel, Professionnel...), gérés
// par le SUPERADMIN — voir plans.routes.js. Prix MENSUEL ; la durée d'un
// abonnement est choisie à l'activation (voir ateliersAbonnement.routes.js).
const nomField = z.string().trim().min(1, "Nom requis.").max(50).transform(normalizeText);
const descriptionField = z.string().trim().max(300).transform(normalizeText);
// Prix du catalogue en FRANC CFA (XOF) : ENTIER (pas de centimes), strictement positif — aucune formule gratuite. OPTIONNEL :
// absent ou null = période non proposée. Aucun prix par défaut.
const prixField = z
  .number({ error: "Nombre entier requis." })
  .int("Le prix doit être un entier (le franc CFA n'a pas de centimes).")
  .min(PRIX_MIN, "Le prix doit être supérieur à zéro.")
  .max(PRIX_MAX, `${PRIX_MAX.toLocaleString("fr-FR")} maximum.`);
// Une fonctionnalité = une ligne courte ; max 20 par plan.
const fonctionnalitesField = z
  .array(z.string().trim().min(1).max(120).transform(normalizeText))
  .max(20, "20 fonctionnalités maximum.");

// Quotas de la formule : une clé ABSENTE = non définie (la formule ne peut pas être activée commercialement tant que les quatre
// ressources ne sont pas décidées) ; `null` = illimité EXPLICITE ; sinon entiers de LIMITE_MIN à LIMITE_MAX (1 à 1 000 000, zéro interdit). Copiés dans chaque nouvel
// abonnement (Abonnement.limites) : modifier une formule ne touche que les futures souscriptions.
const limiteField = z
  .number({ error: "Nombre entier requis." })
  .int("Nombre entier requis.")
  .min(LIMITE_MIN, `Au moins ${LIMITE_MIN}.`)
  .max(LIMITE_MAX, `${LIMITE_MAX.toLocaleString("fr-FR")} maximum.`);
export const limitesField = z
  .object({
    clientes: limiteField.nullable().optional(),
    employes: limiteField.nullable().optional(),
    commandesActives: limiteField.nullable().optional(),
    modeles: limiteField.nullable().optional(),
  })
  .strict();

export const creerPlanSchema = z
  .object({
    nom: nomField,
    description: descriptionField.optional(),
    prixMensuel: prixField.nullable().optional(),
    prixAnnuel: prixField.nullable().optional(),
    fonctionnalites: fonctionnalitesField.optional().default([]),
    limites: limitesField.optional().default({}),
    ordre: z.number().int().min(0).max(999).optional().default(0),
    // Une formule créée est INACTIVE (non proposée) tant que le SUPERADMIN ne l'active pas explicitement.
    actif: z.boolean().optional().default(false),
  })
  .strict();

export const patchPlanSchema = z
  .object({
    nom: nomField.optional(),
    description: descriptionField.nullable().optional(),
    prixMensuel: prixField.nullable().optional(),
    prixAnnuel: prixField.nullable().optional(),
    fonctionnalites: fonctionnalitesField.optional(),
    limites: limitesField.optional(),
    ordre: z.number().int().min(0).max(999).optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });
