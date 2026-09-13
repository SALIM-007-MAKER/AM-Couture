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

  return prisma.$transaction(async (tx) => {
    const atelier = await tx.atelier.create({ data: { nom, devise, telephone, adresse, ville, pays } });
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
