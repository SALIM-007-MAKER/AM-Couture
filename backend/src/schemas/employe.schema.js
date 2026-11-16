import { z } from "zod";
import { nouveauMotDePasseField } from "../lib/passwordPolicy.js";
import { emptyToUndefined, normalizeText, optionalTrimmed } from "../lib/zodHelpers.js";
import { normalizePhone } from "../lib/phone.js";
import { NOMS_POSTES } from "../lib/permissions.js";

const nomField = (label) => z.string().trim().min(1, `${label} requis.`).max(100).transform(normalizeText);
const identifiantField = z.string().trim().min(3, "3 caractères minimum.").max(60);
const emailField = z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().max(190).email("Email invalide.").optional());
const telephoneField = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide (8 à 15 chiffres attendus).")
    .optional(),
);
const posteField = z.enum(NOMS_POSTES, { error: "Poste inconnu." });
// Les noms de permissions ne sont PAS validés ici contre le catalogue : normaliserPermissions() le fait et renvoie les
// permissions inconnues nommément (message plus utile qu'un refus d'enum de 20 valeurs).
const permissionsField = z.array(z.string().trim().min(1).max(60)).max(60);
// Mot de passe du PDG : il confirme les opérations sensibles (voir routes/employes.routes.js). Jamais enregistré.
const confirmationField = z.string().min(1).max(200).optional();

export const createEmployeSchema = z
  .object({
    identifiant: identifiantField,
    password: nouveauMotDePasseField,
    prenom: nomField("Prénom"),
    nom: nomField("Nom"),
    poste: posteField.default("AUTRE"),
    // Absentes : le poste choisi fournit les permissions de départ.
    permissions: permissionsField.optional(),
    email: emailField,
    telephone: telephoneField,
    confirmationMotDePasse: confirmationField,
  })
  .strict();

export const updateEmployeSchema = z
  .object({
    prenom: nomField("Prénom").optional(),
    nom: nomField("Nom").optional(),
    poste: posteField.optional(),
    permissions: permissionsField.optional(),
    email: emailField,
    telephone: telephoneField,
    confirmationMotDePasse: confirmationField,
  })
  .strict()
  .refine((d) => Object.keys(d).filter((k) => k !== "confirmationMotDePasse").length > 0, { message: "Aucune donnée à modifier." });

export const motDePasseEmployeSchema = z
  .object({ nouveauMotDePasse: nouveauMotDePasseField, confirmationMotDePasse: z.string().min(1, "Votre mot de passe est requis.").max(200) })
  .strict();

export const decisionEmployeSchema = z.object({ motif: optionalTrimmed(300) }).strict();

export const listEmployesQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  actif: z.enum(["true", "false", "all"]).optional().default("true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});
