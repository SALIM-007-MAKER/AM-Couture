// Résumé quotidien des alertes par email : réservé au PDG de chaque atelier.
//
// Il contient des alertes financières (commandes impayées) qu'un employé ne doit pas recevoir ; un employé qui a une
// adresse email ne reçoit donc JAMAIS ce résumé (ses alertes se lisent dans l'application, selon ses droits).
// Filtre partagé par la tâche planifiée et ses tests.
export const UTILISATEURS_RESUME_QUOTIDIEN = { email: { not: null }, role: "ADMIN", actif: true };
