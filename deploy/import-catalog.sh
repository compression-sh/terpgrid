#!/usr/bin/env bash
# TERPGRID – lokalen Sortenkatalog (CI-Strains-Pro, CC BY 4.0) importieren bzw. aktualisieren.
#   ./import-catalog.sh             geprüfte Version laden, Prüfsumme vergleichen, importieren
#   ./import-catalog.sh --dry-run   nur prüfen und Qualitätsbericht anzeigen
#   ./import-catalog.sh --file PFAD eigene, bereits heruntergeladene Datei verwenden
# Der Download läuft auf dem Host (der Migrations-Container hat kein Internet). Der Import
# läuft im migrate-Container mit der Owner-Rolle – die laufende API erhält keine Schreibrechte.
# Persönliche Daten werden nicht verändert. Vorher wird kein Backup erzwungen, da nur
# öffentliche Referenzdaten betroffen sind; ein Fehler lässt den bisherigen Katalog unverändert.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
[[ -f .env ]] || die "Keine .env – zuerst install.sh ausführen."

# Muss zu server/src/catalog/cisp.ts (CISP.commit / CISP.sha256) passen – geprüft im CI.
COMMIT="80fbe5d40fac8dda5120f50b946f069c4961f253"
SHA256="469fb653819f0f97c29d17ca6e58451f3e4972da72424ab9ca6d1cd319d9103c"
URL="https://raw.githubusercontent.com/Shannon-Goddard/ci-strains-pro/${COMMIT}/raw-data.csv"

file=""; pass=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) file="${2:-}"; shift 2 ;;
    --dry-run|--force) pass+=("$1"); shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

mkdir -p catalog
if [[ -z "$file" ]]; then
  file="catalog/ci-strains-pro-${COMMIT:0:12}.csv"
  if [[ ! -f "$file" ]]; then
    echo "→ Lade CI-Strains-Pro (Commit ${COMMIT:0:12}) …"
    curl -fsSL --proto '=https' --max-time 300 -o "$file.part" "$URL" || die "Download fehlgeschlagen."
    mv "$file.part" "$file"
  fi
  echo "${SHA256}  ${file}" | sha256sum -c --quiet - || { rm -f "$file"; die "Prüfsumme stimmt nicht – Datei verworfen."; }
  ok "Prüfsumme bestätigt"
else
  [[ -f "$file" ]] || die "Datei nicht gefunden: $file"
  cp "$file" catalog/import.csv
  file="catalog/import.csv"
fi

echo "→ Import im migrate-Container"
docker compose run --rm --no-deps -v "$(pwd)/catalog:/import:ro" migrate \
  node dist/cli.js import-catalog --file "/import/$(basename "$file")" --commit "$COMMIT" "${pass[@]}"
