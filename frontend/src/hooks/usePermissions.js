import { useMeQuery } from "./useAuth.js";
import { peut } from "../features/employes/permissions.js";

/**
 * `const can = useCan(); can("finances.voir")` — adapte l'interface aux permissions du compte connecté. Pure commodité :
 * le serveur revérifie toujours chaque permission, et retire lui-même les montants des réponses d'un employé qui n'a
 * pas « finances.voir ».
 */
export function useCan() {
  const { data: user } = useMeQuery();
  return (permission) => peut(user, permission);
}
