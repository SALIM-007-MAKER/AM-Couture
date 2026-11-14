#!/usr/bin/env bash
# Sauvegarde logique de la base (pg_dump, format custom compressé).
# Usage : DIRECT_URL=postgresql://... ./scripts/backup-db.sh [dossier_sortie]
# - Utilise la connexion DIRECTE (sans -pooler) : pg_dump ne fonctionne pas via pgbouncer.
# - LECTURE SEULE sur la base ; n'écrit que le fichier de sortie.
# - Le fichier contient des données personnelles : à stocker chiffré, hors dépôt.
set -euo pipefail
: "${DIRECT_URL:?DIRECT_URL manquant}"
SORTIE="${1:-./backups}"
mkdir -p "$SORTIE"
FICHIER="$SORTIE/am-couture-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FICHIER" "$DIRECT_URL"
sha256sum "$FICHIER" > "$FICHIER.sha256"
echo "Sauvegarde créée : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
