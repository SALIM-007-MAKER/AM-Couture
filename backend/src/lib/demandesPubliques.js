// Demandes de commande envoyées depuis la vitrine par un visiteur SANS compte (7.3) : durée de conservation.
//
// Ce sont des données personnelles (nom, téléphone) déposées par quelqu'un qui n'est pas encore cliente. Règles :
//  - dès que l'atelier rattache la demande à une fiche cliente, les coordonnées de la demande sont effacées (elles
//    vivent désormais sur la fiche, sous la responsabilité de l'atelier) ;
//  - une demande REFUSÉE et jamais rattachée est purgée après 30 jours ;
//  - une demande restée EN ATTENTE sans suite est purgée après 90 jours ;
//  - une demande acceptée a forcément une fiche cliente : elle n'est pas concernée.
// La purge s'exécute avec la tâche planifiée quotidienne (routes/cron.routes.js).
export const JOURS_CONSERVATION_REFUSEE = 30;
export const JOURS_CONSERVATION_EN_ATTENTE = 90;

const JOUR = 86_400_000;

/** Supprime les demandes publiques sans fiche cliente dont le délai de conservation est dépassé. Renvoie le nombre supprimé. */
export async function purgerDemandesPubliques(prisma, maintenant = new Date()) {
  const limiteRefusee = new Date(maintenant.getTime() - JOURS_CONSERVATION_REFUSEE * JOUR);
  const limiteAttente = new Date(maintenant.getTime() - JOURS_CONSERVATION_EN_ATTENTE * JOUR);
  const res = await prisma.demandeCommande.deleteMany({
    where: {
      origine: "VITRINE",
      clienteId: null,
      OR: [
        { statut: "REFUSEE", updatedAt: { lt: limiteRefusee } },
        { statut: "EN_ATTENTE", createdAt: { lt: limiteAttente } },
      ],
    },
  });
  return res.count;
}
