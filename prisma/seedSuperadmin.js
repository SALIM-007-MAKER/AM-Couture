// Amorçage du compte SUPERADMIN de la plateforme (Phase 8 — multi-tenant).
// Même principe que seed.js (compte ADMIN d'un atelier) : aucun identifiant/
// mot de passe en dur, lus depuis l'environnement. Idempotent — sans effet
// si le compte existe déjà. `atelierId` reste volontairement absent : un
// SUPERADMIN n'appartient à aucun atelier, il administre la plateforme.
//
// Usage : node --experimental-strip-types --env-file=.env prisma/seedSuperadmin.js
import bcrypt from "bcryptjs";
import { prisma } from "../backend/src/lib/prisma.js";

const identifiant = process.env.SEED_SUPERADMIN_IDENTIFIANT;
const password = process.env.SEED_SUPERADMIN_PASSWORD;

if (!identifiant || !password) {
  console.error(
    "SEED_SUPERADMIN_IDENTIFIANT et SEED_SUPERADMIN_PASSWORD doivent être définis dans .env pour amorcer le compte SUPERADMIN.",
  );
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { identifiant } });

if (existing) {
  console.log(`Compte "${identifiant}" déjà existant — rien à faire.`);
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { identifiant, passwordHash, role: "SUPERADMIN", atelierId: null },
  });
  console.log(`Compte SUPERADMIN créé : ${user.identifiant} (id ${user.id})`);
}

await prisma.$disconnect();
