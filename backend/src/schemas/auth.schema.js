import { z } from "zod";

export const loginSchema = z.object({
  identifiant: z.string().trim().min(1, "Identifiant requis."),
  password: z.string().min(1, "Mot de passe requis."),
});

// POST /api/auth/mot-de-passe-oublie — un seul champ, volontairement nommé
// comme sur le formulaire de connexion (pas de champ "email" séparé : même
// principe qu'à l'inscription, l'identifiant EST l'email pour un compte
// créé en libre-service — voir inscriptionAtelierSchema).
export const motDePasseOublieSchema = z.object({
  identifiant: z.string().trim().min(1, "Identifiant requis."),
});

// POST /api/auth/reinitialiser-mot-de-passe-token — nom distinct de
// reinitialiserMotDePasseSchema (atelierAdmin.schema.js, action SUPERADMIN
// sur un compte ciblé par id) : ici le jeton lui-même désigne le compte,
// pas de userId dans le corps de la requête.
export const reinitialiserMotDePasseTokenSchema = z.object({
  token: z.string().trim().min(1, "Jeton requis."),
  nouveauMotDePasse: z.string().min(8, "8 caractères minimum."),
});
