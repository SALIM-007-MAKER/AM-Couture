// Forme Prisma `include` commune à toutes les routes qui renvoient un Recu
// (création, détail, liste, PDF) — évite la divergence entre endpoints sur
// les champs de contexte (cliente/commande/paiement) affichés.
export const RECU_INCLUDE = {
  commande: {
    select: {
      id: true,
      numero: true,
      cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
    },
  },
  paiement: { select: { id: true, montant: true, mode: true, date: true, reference: true } },
};
