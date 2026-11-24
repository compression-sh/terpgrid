#!/usr/bin/env bash
# TERPGRID – zwischengespeicherte StrainAPI-Angaben des Sortenkatalogs gedrosselt aktualisieren.
#   ./refresh-catalog.sh            nur abrufen, wenn Angaben in 7 Tagen ablaufen und der letzte Abruf ≥ 20 h her ist
#   ./refresh-catalog.sh --force    Drosselung ignorieren (manuell, sparsam verwenden)
# Läuft im api-Container (hat ausgehenden Internetzugang) mit der Laufzeitrolle: sie darf nur die
# Anreicherungstabellen schreiben, nicht den Kernkatalog und keine Nutzerdaten. Ein Abruf sind höchstens
# 8 Seitenanfragen mit Pause (Nutzungsbedingungen von StrainAPI: Zwischenspeicher ja, Spiegelung nein).
# Optional per systemd-Timer (deploy/systemd/terpgrid-catalog-refresh.timer) – wird nicht automatisch aktiviert.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
[[ -f .env ]] || die "Keine .env – zuerst install.sh ausführen."

pass=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) pass+=("--force"); shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

docker compose exec -T api node dist/cli.js enrich-catalog --provider strainapi --refresh "${pass[@]}"
