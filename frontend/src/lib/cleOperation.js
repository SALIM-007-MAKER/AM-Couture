import { useState } from "react";

// Clé d'idempotence d'UNE opération (sortie de stock, réception...) : stable tant que la saisie ne change pas, donc un
// double clic ou un renvoi après coupure rejoue la même opération au lieu de la répéter ; nouvelle dès que la saisie
// change (le serveur refuse une même clé avec un corps différent) et donc aussi après un succès, le formulaire étant vidé.
export function cleOperation(precedent, signature, generer = () => globalThis.crypto.randomUUID()) {
  if (precedent && precedent.signature === signature) return precedent;
  return { signature, cle: `op-${generer()}` };
}

/** `signature` : texte décrivant la saisie courante (par exemple JSON.stringify du corps envoyé). */
export function useCleOperation(signature) {
  const [etat, setEtat] = useState(() => cleOperation(null, signature));
  const courant = cleOperation(etat, signature);
  // État dérivé de la saisie : React autorise ce réglage pendant le rendu (il relance aussitôt le rendu avec la nouvelle clé).
  if (courant !== etat) setEtat(courant);
  return courant.cle;
}
