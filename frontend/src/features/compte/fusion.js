// PATCH /api/compte ne renvoie qu'un extrait du compte (id, identifiant, langue, createdAt), alors que le cache
// ["auth","me"] contient l'utilisateur complet (rôle, atelier, poste, permissions...). Remplacer le cache par cet extrait
// faisait perdre le rôle : un SuperAdmin qui changeait de langue était renvoyé vers l'écran d'un atelier, vide.
// On fusionne donc : les champs reçus l'emportent, tous les autres sont conservés.
export function fusionnerUtilisateur(ancien, recu) {
  return { ...(ancien ?? {}), ...recu };
}
