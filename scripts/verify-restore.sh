#!/usr/bin/env bash
# Vérifie qu'une sauvegarde est RÉELLEMENT restaurable : la restaure dans une base
# JETABLE puis compare le nombre de lignes de tables clés avec la source.
# Usage : ./scripts/verify-restore.sh fichier.dump "postgresql://.../base_scratch" ["postgresql://.../source"]
# SÉCURITÉ : refuse de tourner si la cible ressemble à la base de production
# (même URL que DIRECT_URL/DATABASE_URL) — ne JAMAIS restaurer sur la prod pour tester.
set -euo pipefail
DUMP="${1:?fichier .dump requis}"
CIBLE="${2:?URL de la base scratch requise}"
SOURCE="${3:-}"
for prod in "${DIRECT_URL:-}" "${DATABASE_URL:-}"; do
  if [ -n "$prod" ] && [ "$CIBLE" = "$prod" ]; then
    echo "REFUS : la cible est la base de production." >&2; exit 2
  fi
done
sha256sum -c "$DUMP.sha256"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$CIBLE" "$DUMP"
TABLES=("Atelier" "User" "Cliente" "Commande" "Paiement" "Recu" "Abonnement")
for t in "${TABLES[@]}"; do
  n=$(psql "$CIBLE" -tAc "SELECT count(*) FROM \"$t\"")
  if [ -n "$SOURCE" ]; then
    s=$(psql "$SOURCE" -tAc "SELECT count(*) FROM \"$t\"")
    [ "$n" = "$s" ] && echo "OK   $t : $n" || echo "ÉCART $t : restauré=$n source=$s (normal si la source a changé depuis la sauvegarde)"
  else
    echo "     $t : $n lignes restaurées"
  fi
done
echo "Restauration vérifiée."
