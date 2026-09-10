import { useEffect, useState } from "react";

/** Retarde la propagation d'une valeur (ex : champ de recherche) pour éviter
 * un appel API à chaque frappe. Purement UI — aucune règle métier. */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
