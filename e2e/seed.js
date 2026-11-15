// Jeu de données déterministe des tests de bout en bout. VIDE toute la base puis recrée :
//  - 1 SUPERADMIN ;
//  - atelier ALPHA : 1 PDG, 2 clientes (dont « Awa Alpha » avec compte client et une commande acomptée) ;
//  - atelier BETA : 1 PDG, 1 cliente « Secrète Beta » avec commande — sert à prouver l'isolation entre ateliers.
//
// Garde-fous : refuse toute base dont le nom ne contient pas « e2e » ou dont l'hôte n'est pas local.
import bcrypt from "bcryptjs";

export const MOT_DE_PASSE = "Passe-e2e-123";
export const COMPTES = {
  superadmin: "e2e-superadmin",
  pdgAlpha: "e2e-pdg-alpha",
  pdgBeta: "e2e-pdg-beta",
  clientAlpha: "e2e-client-alpha",
};

function verifierBase(url) {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  const nomOk = u.pathname.toLowerCase().includes("e2e");
  if (!local || !nomOk) {
    throw new Error(`Seed E2E refusé : la base doit être locale et son nom contenir « e2e » (reçu : ${u.hostname}${u.pathname}).`);
  }
}

export async function reinitialiserEtSemer() {
  verifierBase(process.env.E2E_DATABASE_URL);
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  process.env.DIRECT_URL = process.env.E2E_DATABASE_URL;
  const { prisma } = await import("../backend/src/lib/prisma.js");

  // Vide toutes les tables métier (sauf l'historique des migrations).
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const liste = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${liste} RESTART IDENTITY CASCADE`);
  }

  const passwordHash = await bcrypt.hash(MOT_DE_PASSE, 4);
  const livraison = new Date(Date.now() + 10 * 86_400_000);

  await prisma.user.create({ data: { identifiant: COMPTES.superadmin, passwordHash, role: "SUPERADMIN" } });

  const alpha = await prisma.atelier.create({ data: { nom: "Atelier E2E Alpha", devise: "FCFA" } });
  await prisma.user.create({
    data: { identifiant: COMPTES.pdgAlpha, passwordHash, role: "ADMIN", atelierId: alpha.id, prenom: "Paul", nom: "Alpha" },
  });
  const awa = await prisma.cliente.create({
    data: { atelierId: alpha.id, prenom: "Awa", nom: "Alpha", telephone: "90000001" },
  });
  // Bintou a des mesures : une commande ne peut être créée que pour une cliente qui en a (règle métier).
  const bintou = await prisma.cliente.create({ data: { atelierId: alpha.id, prenom: "Bintou", nom: "Alpha", telephone: "90000002" } });
  await prisma.mesure.create({ data: { clienteId: bintou.id, poitrine: "90", taille: "70", hanches: "95" } });
  const userAwa = await prisma.user.create({
    data: { identifiant: COMPTES.clientAlpha, passwordHash, role: "USER", atelierId: alpha.id },
  });
  await prisma.cliente.update({ where: { id: awa.id }, data: { userId: userAwa.id } });
  const cmdAwa = await prisma.commande.create({
    data: {
      atelierId: alpha.id, clienteId: awa.id, numero: "E2E-ALPHA-001", typeVetement: "ROBE",
      prixTotal: "50000", dateLivraisonPrevue: livraison,
    },
  });
  await prisma.paiement.create({
    data: { commandeId: cmdAwa.id, montant: "20000", mode: "ESPECES" },
  });

  const beta = await prisma.atelier.create({ data: { nom: "Atelier E2E Beta", devise: "FCFA" } });
  await prisma.user.create({
    data: { identifiant: COMPTES.pdgBeta, passwordHash, role: "ADMIN", atelierId: beta.id, prenom: "Berthe", nom: "Beta" },
  });
  const secrete = await prisma.cliente.create({
    data: { atelierId: beta.id, prenom: "Secrète", nom: "Beta", telephone: "90000003" },
  });
  const cmdBeta = await prisma.commande.create({
    data: {
      atelierId: beta.id, clienteId: secrete.id, numero: "E2E-BETA-001", typeVetement: "ROBE",
      prixTotal: "99999", dateLivraisonPrevue: livraison,
    },
  });

  await prisma.$disconnect();
  return { alphaId: alpha.id, betaId: beta.id, clienteBetaId: secrete.id, commandeBetaId: cmdBeta.id, commandeAlphaId: cmdAwa.id };
}
