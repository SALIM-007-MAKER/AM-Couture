// Amorçage du compte administrateur initial (modèle User).
// Aucun identifiant/mot de passe en dur : lus depuis l'environnement
// (SEED_ADMIN_IDENTIFIANT / SEED_ADMIN_PASSWORD). Idempotent — sans effet si
// le compte existe déjà.
//
// Usage : node --experimental-strip-types --env-file=.env prisma/seed.js
// (ou : npm run prisma:seed)
import bcrypt from "bcryptjs";
import { prisma } from "../backend/src/lib/prisma.js";

const identifiant = process.env.SEED_ADMIN_IDENTIFIANT;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!identifiant || !password) {
  console.error(
    "SEED_ADMIN_IDENTIFIANT et SEED_ADMIN_PASSWORD doivent être définis dans .env pour amorcer le compte administrateur.",
  );
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { identifiant } });

if (existing) {
  console.log(`Compte "${identifiant}" déjà existant — rien à faire.`);
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { identifiant, passwordHash } });
  console.log(`Compte administrateur créé : ${user.identifiant} (id ${user.id})`);
}

await prisma.$disconnect();
