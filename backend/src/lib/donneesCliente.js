// Droit d'accès, de portabilité et d'effacement d'une cliente (7.4).
//
//  - exporterDonnees : tout ce que le système détient sur elle, en un fichier lisible (JSON), jamais celui d'une autre.
//  - anonymiserCliente : remplace son identité par des valeurs neutres et supprime ce qui n'a de sens que rattaché à la
//    personne (mesures, fil d'activité). Les commandes, paiements, livraisons et reçus RESTENT (obligation comptable de
//    l'atelier) mais ne portent plus d'identité. Irréversible : l'identité d'origine n'est conservée nulle part.
export const IDENTITE_ANONYMISEE = { nom: "Cliente", prenom: "anonymisée" };

/** Données d'une cliente, pour son propre export. `clienteId` vient TOUJOURS du jeton, jamais de la requête. */
export async function exporterDonnees(prisma, clienteId) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: { atelier: { select: { nom: true } } },
  });
  if (!cliente) return null;
  // userId et atelierId : identifiants techniques internes, sans intérêt pour la personne.
  const { atelier, userId: _userId, atelierId: _atelierId, ...profil } = cliente;
  const [mesures, commandes, recus, demandes, evenements] = await Promise.all([
    prisma.mesure.findMany({ where: { clienteId }, orderBy: { createdAt: "desc" } }),
    prisma.commande.findMany({
      where: { clienteId },
      orderBy: { dateCommande: "desc" },
      select: {
        numero: true,
        typeVetement: true,
        description: true,
        couleur: true,
        tissu: true,
        prixTotal: true,
        statut: true,
        priorite: true,
        dateCommande: true,
        dateLivraisonPrevue: true,
        modele: { select: { nom: true } },
        paiements: {
          orderBy: { date: "asc" },
          select: { montant: true, date: true, mode: true, reference: true, commentaire: true, annuleAt: true, annuleMotif: true },
        },
        livraisons: {
          orderBy: { dateLivraison: "asc" },
          select: { dateLivraison: true, montantRestant: true, commentaire: true, annuleAt: true, annuleMotif: true },
        },
      },
    }),
    prisma.recu.findMany({
      where: { commande: { clienteId } },
      orderBy: { createdAt: "asc" },
      select: { numero: true, montantPaye: true, createdAt: true, commande: { select: { numero: true } } },
    }),
    prisma.demandeCommande.findMany({
      where: { clienteId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, statut: true, description: true, motifRefus: true, modele: { select: { nom: true } }, commande: { select: { numero: true } } },
    }),
    prisma.notificationClient.findMany({ where: { clienteId }, orderBy: { createdAt: "asc" }, select: { type: true, message: true, createdAt: true } }),
  ]);
  return {
    exporteLe: new Date().toISOString(),
    atelier: atelier.nom,
    profil,
    mesures,
    commandes,
    recus,
    demandes,
    activite: evenements,
  };
}

const STATUTS_OUVERTS = ["NOUVELLE", "EN_CONFECTION", "ESSAYAGE", "RETOUCHES", "TERMINEE"];

/**
 * Anonymise une cliente de l'atelier. Refuse (via `erreurConflit`) tant qu'une commande est ouverte (on ne peut pas
 * confectionner pour quelqu'un dont on a effacé l'identité) ; l'atelier doit d'abord la livrer ou l'annuler.
 * Renvoie la cliente anonymisée, ou null si elle n'existe pas dans cet atelier.
 */
export async function anonymiserCliente(prisma, { clienteId, atelierId }, erreurConflit) {
  return prisma.$transaction(async (tx) => {
    const lignes = await tx.$queryRaw`SELECT "userId", "anonymiseeLe" FROM "Cliente" WHERE id = ${clienteId} AND "atelierId" = ${atelierId} FOR UPDATE`;
    if (lignes.length === 0) return null;
    if (lignes[0].anonymiseeLe) throw erreurConflit("Cette cliente est déjà anonymisée.");
    const ouvertes = await tx.commande.count({ where: { clienteId, statut: { in: STATUTS_OUVERTS } } });
    if (ouvertes > 0) throw erreurConflit("Cette cliente a encore des commandes en cours : livrez-les ou annulez-les avant d'anonymiser.");

    if (lignes[0].userId) await tx.user.delete({ where: { id: lignes[0].userId } }); // le compte de connexion disparaît aussi
    await tx.mesure.deleteMany({ where: { clienteId } });
    await tx.notificationClient.deleteMany({ where: { clienteId } });
    // Le texte libre d'une demande peut citer la personne : on garde la trace (statut, modèle, commande liée), pas le texte.
    await tx.demandeCommande.updateMany({ where: { clienteId }, data: { description: null, motifRefus: null } });
    return tx.cliente.update({
      where: { id: clienteId },
      data: {
        ...IDENTITE_ANONYMISEE,
        telephone: `anonyme-${clienteId}`, // valeur unique : libère le vrai numéro (doublons, nouvelle fiche, invitation)
        telephone2: null,
        email: null,
        adresse: null,
        sexe: null,
        notes: null,
        userId: null,
        archivedAt: new Date(),
        anonymiseeLe: new Date(),
      },
    });
  });
}
