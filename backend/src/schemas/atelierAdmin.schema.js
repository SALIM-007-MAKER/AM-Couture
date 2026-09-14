import { z } from "zod";
import { emptyToUndefined, normalizeText, optionalTrimmed } from "../lib/zodHelpers.js";
import { normalizePhone } from "../lib/phone.js";
import { LANGUES_DISPONIBLES } from "./compte.schema.js";

// Provisioning d'un nouvel atelier (tenant) par le SUPERADMIN — voir
// ateliers.routes.js. Distinct de atelier.schema.js (PUT/PATCH /parametres,
// utilisé par l'ADMIN pour ÉDITER SON PROPRE atelier) : ici on crée un
// atelier ET son premier compte ADMIN en une seule opération.
const nomAtelierField = z.string().trim().min(1, "Nom de l'atelier requis.").max(150).transform(normalizeText);
const deviseField = z.string().trim().min(1).max(10).optional().default("FCFA");
const telephoneField = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide.")
    .optional(),
);

// Mêmes bornes que compte.schema.js (changement de mot de passe) — cohérence
// du niveau d'exigence dans tout le projet.
const identifiantField = z.string().trim().min(3, "3 caractères minimum.").max(60);
const passwordField = z.string().min(8, "8 caractères minimum.");

export const creerAtelierSchema = z
  .object({
    nom: nomAtelierField,
    devise: deviseField,
    telephone: telephoneField,
    adresse: optionalTrimmed(255),
    adminIdentifiant: identifiantField,
    adminPassword: passwordField,
  })
  .strict();

// Champ requis (contrairement à telephoneField ci-dessus, optionnel pour la
// création SUPERADMIN) — l'inscription en libre-service (Phase 8) le demande
// explicitement, voir InscriptionAtelierPage.jsx.
const telephoneRequisField = z.preprocess(
  emptyToUndefined,
  z
    .string({ required_error: "Téléphone requis." })
    .trim()
    .transform(normalizePhone)
    .refine((v) => /^\+?\d{8,15}$/.test(v), "Numéro de téléphone invalide."),
);
const personNameField = (label) => z.string().trim().min(1, `${label} requis.`).max(100).transform(normalizeText);
// max 190 : marge usuelle pour un email (RFC 5321 plafonne à 254, largement
// suffisant en pratique) — cohérent avec la colonne User.email (schema.prisma).
const emailField = z.string().trim().toLowerCase().max(190).email("Email invalide.");

// Inscription en libre-service (Phase 8, décision ultérieure à
// creerAtelierSchema ci-dessus) : un propriétaire d'atelier crée lui-même son
// atelier + son compte ADMIN, sans SUPERADMIN — voir
// POST /api/auth/inscription-atelier (auth.routes.js). Contrairement à
// creerAtelierSchema (outil interne SUPERADMIN, minimal), demande l'identité
// complète du propriétaire : `adminIdentifiant` n'existe pas ici, l'email
// sert directement d'identifiant de connexion (voir la route, qui réutilise
// `email` pour ce champ lors de l'appel à creerAtelierEtAdmin).
// `nom` (atelier) OPTIONNEL : un repli ("Atelier de {prénom}") est appliqué
// côté route si non fourni — un propriétaire pressé doit pouvoir s'inscrire
// sans avoir déjà choisi de nom commercial.
export const inscriptionAtelierSchema = z
  .object({
    nom: nomAtelierField.optional(),
    prenom: personNameField("Prénom"),
    nomProprietaire: personNameField("Nom"),
    email: emailField,
    adminPassword: passwordField,
    telephone: telephoneRequisField,
    ville: optionalTrimmed(100),
    pays: optionalTrimmed(100),
    devise: deviseField,
    langue: z.enum(LANGUES_DISPONIBLES).optional().default("fr"),
  })
  .strict();

// PATCH /api/ateliers/:id (SUPERADMIN uniquement) — modifie la fiche d'UN
// atelier existant. Distinct de patchParametresSchema (atelier.schema.js,
// utilisé par l'ADMIN pour éditer SON PROPRE atelier via /parametres) :
// même liste de champs éditables, mais jamais le même appelant. `slogan`
// et `logoUrl` restent la responsabilité de l'ADMIN de l'atelier (marque
// commerciale) — pas exposés ici.
export const patchAtelierSchema = z
  .object({
    nom: nomAtelierField.optional(),
    devise: z.string().trim().min(1, "Devise requise.").max(10).transform(normalizeText).optional(),
    telephone: telephoneField,
    adresse: optionalTrimmed(255),
    ville: optionalTrimmed(100),
    pays: optionalTrimmed(100),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à modifier." });

// PATCH /api/ateliers/:id/statut (SUPERADMIN uniquement) — active/suspend.
export const statutAtelierSchema = z.object({ actif: z.boolean() }).strict();

// PATCH /api/ateliers/:id/comptes/:userId/mot-de-passe (SUPERADMIN
// uniquement) — remet à zéro le mot de passe d'un compte, en dernier
// recours (aucune récupération en libre-service n'existe dans cette phase :
// pas d'email vérifié, pas d'envoi d'email — voir décision Phase 8). Mêmes
// bornes que passwordField ci-dessus.
export const reinitialiserMotDePasseSchema = z.object({ nouveauMotDePasse: passwordField }).strict();

// GET /api/ateliers — mêmes bornes que listClientesQuerySchema
// (cliente.schema.js) : `q` recherche par nom d'atelier, pagination
// identique dans toute l'app.
export const listAteliersQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(120).optional()),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// POST /api/ateliers/:id/comptes (SUPERADMIN uniquement) — ajoute un compte
// supplémentaire ("employé") à un atelier EXISTANT. Décision Phase 8 :
// mêmes permissions que l'ADMIN (rôle ADMIN, accès complet à l'atelier) —
// aucun système de permissions restreintes construit à ce stade faute de
// spécification précise sur ce que doit voir/faire un "employé" par rapport
// au propriétaire. Identité (prénom/nom/email) optionnelle ici — contexte
// interne SUPERADMIN, moins formel que l'inscription en libre-service.
export const ajouterCompteSchema = z
  .object({
    identifiant: identifiantField,
    password: passwordField,
    prenom: optionalTrimmed(100),
    nom: optionalTrimmed(100),
    email: z.preprocess(emptyToUndefined, emailField.optional()),
  })
  .strict();
