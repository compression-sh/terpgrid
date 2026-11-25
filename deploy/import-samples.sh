#!/usr/bin/env bash
# TERPGRID – öffentliche Laborproben importieren (Smith et al. 2022, PLoS ONE, Datensatz CC0 1.0).
#   ./import-samples.sh             geprüfte Version laden, Prüfsumme vergleichen, importieren
#   ./import-samples.sh --dry-run   nur prüfen und Zählwerte anzeigen
#   ./import-samples.sh --file PFAD bereits heruntergeladene Datei verwenden
# Jede Zeile ist EINE Blütenprobe eines US-Handelsprodukts (ohne Breeder). Proben werden in der
# App nur gleichnamigen, photoperiodischen Katalogsorten zugeordnet und als solche gekennzeichnet.
# Läuft im migrate-Container mit der Owner-Rolle; Nutzerdaten werden nicht verändert.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
[[ -f .env ]] || die "Keine .env – zuerst install.sh ausführen."

# Muss zu server/src/catalog/samples.ts (SMITH2022.commit / .sha256) passen – geprüft in den Tests.
COMMIT="e71c838e6bacdb3302c9410c595f09f3aea9984f"
SHA256="1850b918bb3a00b903f9e254953bb695012314bd264c419efb68bc482b392182"
URL="https://raw.githubusercontent.com/cjsmith015/phytochemical-diversity-cannabis/${COMMIT}/data/preproc_lab_data_pub_20220218.csv"

file=""; pass=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) file="${2:-}"; shift 2 ;;
    --dry-run|--force) pass+=("$1"); shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

mkdir -p catalog
if [[ -z "$file" ]]; then
  file="catalog/smith2022-${COMMIT:0:12}.csv"
  if [[ ! -f "$file" ]]; then
    echo "→ Lade Laborproben (Commit ${COMMIT:0:12}) …"
    curl -fsSL --proto '=https' --max-time 300 --max-filesize 50000000 -o "$file.part" "$URL" || die "Download fehlgeschlagen."
    mv "$file.part" "$file"
  fi
  echo "${SHA256}  ${file}" | sha256sum -c --quiet - || { rm -f "$file"; die "Prüfsumme stimmt nicht – Datei verworfen."; }
  ok "Prüfsumme bestätigt"
else
  [[ -f "$file" ]] || die "Datei nicht gefunden: $file"
  cp "$file" catalog/samples-import.csv
  file="catalog/samples-import.csv"
fi

echo "→ Import im migrate-Container"
docker compose run --rm --no-deps -v "$(pwd)/catalog:/import:ro" migrate \
  node dist/cli.js import-samples --file "/import/$(basename "$file")" "${pass[@]}"
