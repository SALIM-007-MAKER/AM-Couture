/**
 * Génère atomiquement un numéro séquentiel du type "CMD-2026-0001" en
 * s'appuyant sur le modèle Counter (id = "CMD-2026", "REC-2026"... un
 * compteur par préfixe ET par année civile, remise à zéro chaque nouvelle
 * année — voir le commentaire du modèle Counter dans schema.prisma).
 *
 * DOIT être appelé avec le client de transaction (tx), à l'intérieur du
 * même $transaction que la création de l'enregistrement numéroté : si le
 * reste de la transaction échoue, l'incrément du compteur est annulé avec
 * elle (jamais de numéro "brûlé" pour une commande qui n'existe pas).
 *
 * Utilise une requête SQL brute (INSERT ... ON CONFLICT ... DO UPDATE)
 * plutôt qu'un upsert() Prisma générique : la garantie d'absence de
 * collision sous requêtes concurrentes doit venir d'une opération atomique
 * unique côté base (verrouillage de ligne implicite de Postgres), pas d'une
 * hypothèse sur l'implémentation interne de l'ORM.
 */
export async function nextNumero(tx, prefix) {
  const year = new Date().getUTCFullYear();
  const counterId = `${prefix}-${year}`;

  const rows = await tx.$queryRaw`
    INSERT INTO "Counter" (id, valeur)
    VALUES (${counterId}, 1)
    ON CONFLICT (id) DO UPDATE SET valeur = "Counter"."valeur" + 1
    RETURNING valeur
  `;
  const valeur = Number(rows[0].valeur);
  const seq = String(valeur).padStart(4, "0");
  return `${prefix}-${year}-${seq}`;
}
