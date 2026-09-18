import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";

// Logique partagée entre les DEUX façons de créer un atelier (Phase 8) :
//  - SUPERADMIN authentifié, POST /api/ateliers (ateliers.routes.js) — appelle
//    sans prenom/nomProprietaire/email/langue/ville/pays, tous optionnels ici.
//  - propriétaire d'atelier non-authentifié, POST /api/auth/inscription-atelier
//    (auth.routes.js) — inscription en libre-service, fournit tous les champs.
// Un seul et même comportement (unicité de l'identifiant, coût bcrypt,
// transaction atomique atelier+admin) quelle que soit l'origine.
export async function creerAtelierEtAdmin({
  nom,
  logoUrl,
  devise,
  telephone,
  adresse,
  ville,
  pays,
  adminIdentifiant,
  adminPassword,
  prenom,
  nomProprietaire,
  email,
  langue,
  // Champ/message sous lesquels signaler un conflit d'identifiant déjà pris :
  // la console SUPERADMIN a un champ `adminIdentifiant` explicite, tandis que
  // l'inscription en libre-service réutilise l'email comme identifiant — un
  // conflit doit alors s'afficher sous le champ `email` du formulaire, avec
  // un message qui parle d'email, pas d'un champ qui n'existe pas dans ce
  // formulaire (voir auth.routes.js).
  identifiantErrorField = "adminIdentifiant",
  identifiantErrorMessage = "Cet identifiant est déjà utilisé.",
}) {
  const existant = await prisma.user.findUnique({ where: { identifiant: adminIdentifiant } });
  if (existant) {
    throw new HttpError(409, identifiantErrorMessage, {
      [identifiantErrorField]: [identifiantErrorMessage],
    });
  }

  // Coût 12 — identique à prisma/seed.js et compte.routes.js, seules autres
  // origines d'un hash dans ce projet.
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Essai gratuit de 15 jours (§ plan trial) — posé UNE SEULE FOIS ici, à la
  // création, quelle que soit l'origine (SUPERADMIN ou inscription en
  // libre-service) : jamais recalculé ni prolongé après coup, jamais
  // accepté depuis le frontend (voir lib/trial.js, middlewares/auth.middleware.js).
  const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const atelier = await tx.atelier.create({
      data: { nom, logoUrl, devise, telephone, adresse, ville, pays, trialEndsAt },
    });
    const admin = await tx.user.create({
      data: {
        identifiant: adminIdentifiant,
        passwordHash,
        role: "ADMIN",
        atelierId: atelier.id,
        prenom,
        nom: nomProprietaire,
        email,
        langue,
      },
    });
    return { atelier, admin };
  });
}

// Réinitialisation de mot de passe par le SUPERADMIN (voir
// ateliers.routes.js) — dernier recours en l'absence de tout mécanisme de
// récupération en libre-service (pas d'email vérifié envoyé/à ce stade, voir
// décision Phase 8). `atelierId` vérifie l'appartenance du compte à CET
// atelier avant toute écriture (même logique IDOR que les routes imbriquées
// paiements/livraisons/reçus) — un SUPERADMIN qui se trompe d'URL ne
// réinitialise jamais le compte d'un autre atelier par erreur.
export async function reinitialiserMotDePasse({ atelierId, userId, nouveauMotDePasse }) {
  const compte = await prisma.user.findFirst({ where: { id: userId, atelierId } });
  if (!compte) {
    throw new HttpError(404, "Compte introuvable pour cet atelier.");
  }
  const passwordHash = await bcrypt.hash(nouveauMotDePasse, 12);
  // sessionVersion incrémenté : voir requireAuth (auth.middleware.js) —
  // invalide immédiatement toute session déjà ouverte avec l'ancien mot de
  // passe (le SUPERADMIN réinitialise typiquement parce que le compte est
  // compromis ou son propriétaire enfermé dehors, dans les deux cas les
  // sessions existantes ne doivent pas survivre).
  await prisma.user.update({ where: { id: compte.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
}

// Ajoute un compte ("employé") à un atelier EXISTANT — voir
// ajouterCompteSchema (atelierAdmin.schema.js) pour la décision "mêmes
// permissions que l'ADMIN".
export async function ajouterCompteAtelier({ atelierId, identifiant, password, prenom, nom, email }) {
  const atelier = await prisma.atelier.findUnique({ where: { id: atelierId }, select: { id: true } });
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");

  const existant = await prisma.user.findUnique({ where: { identifiant } });
  if (existant) {
    throw new HttpError(409, "Cet identifiant est déjà utilisé.", {
      identifiant: ["Cet identifiant est déjà utilisé."],
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: { identifiant, passwordHash, role: "ADMIN", atelierId, prenom, nom, email },
  });
}

// Démarre une impersonation : le SUPERADMIN `superadminId` va agir avec le
// jeton du compte ADMIN `userId` de l'atelier `atelierId` (voir
// ateliers.routes.js, POST .../impersonation). Journalise l'événement AVANT
// tout (voir JournalImpersonation, schema.prisma) : si la journalisation
// échoue, l'impersonation entière échoue plutôt que de laisser un accès non
// tracé — jamais l'inverse (accès d'abord, log en best-effort ensuite).
export async function demarrerImpersonation({ atelierId, userId, superadminId }) {
  const atelier = await prisma.atelier.findUnique({ where: { id: atelierId }, select: { nom: true, actif: true } });
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");
  // Un atelier suspendu refuse déjà toute requête via requireAtelier — issue
  // un jeton pour ce compte serait un accès qui ne mènerait qu'à des 403,
  // trompeur pour le SUPERADMIN qui croirait "voir" l'atelier.
  if (!atelier.actif) {
    throw new HttpError(409, "Cet atelier est suspendu : l'impersonation est désactivée tant qu'il l'est.");
  }

  const compte = await prisma.user.findFirst({
    where: { id: userId, atelierId },
    select: { id: true, identifiant: true, role: true, atelierId: true, sessionVersion: true },
  });
  if (!compte) throw new HttpError(404, "Compte introuvable pour cet atelier.");
  if (compte.role !== "ADMIN") {
    throw new HttpError(409, "Seul un compte ADMIN d'atelier peut faire l'objet d'une impersonation.");
  }

  const superadmin = await prisma.user.findUnique({ where: { id: superadminId }, select: { identifiant: true } });

  await prisma.journalImpersonation.create({
    data: {
      superadminId,
      superadminIdentifiant: superadmin?.identifiant ?? "?",
      atelierId,
      atelierNom: atelier.nom,
      adminUserId: compte.id,
      adminIdentifiant: compte.identifiant,
    },
  });

  return compte;
}

// Supprime un compte ADMIN d'un atelier — refuse de laisser l'atelier sans
// AUCUN compte ADMIN (personne ne pourrait plus jamais le gérer, et il
// n'existe aucune façon d'en recréer un depuis le côté ADMIN — seul le
// SUPERADMIN le peut, via ce même formulaire "Ajouter un compte").
//
// Restreint EXPLICITEMENT à role: "ADMIN" (§ plan rôle USER, Phase 3) : ce
// chemin gère les comptes ADMIN d'un atelier, jamais ses comptes clients
// (USER) — le compte ET le décompte du "dernier compte" ignorent les
// clients, sans quoi la présence de comptes USER masquerait qu'on retire le
// DERNIER ADMIN restant.
export async function supprimerCompteAtelier({ atelierId, userId }) {
  const compte = await prisma.user.findFirst({ where: { id: userId, atelierId, role: "ADMIN" } });
  if (!compte) throw new HttpError(404, "Compte introuvable pour cet atelier.");

  const nombreComptes = await prisma.user.count({ where: { atelierId, role: "ADMIN" } });
  if (nombreComptes <= 1) {
    throw new HttpError(409, "Impossible de supprimer le dernier compte ADMIN de cet atelier.");
  }
  await prisma.user.delete({ where: { id: compte.id } });
}
