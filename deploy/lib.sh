#!/usr/bin/env bash
# Gemeinsame Hilfsfunktionen der Betriebsskripte (wird per „source“ eingebunden).
# Gibt nie Secrets aus.

c_red=$'\e[31m'; c_grn=$'\e[32m'; c_ylw=$'\e[33m'; c_off=$'\e[0m'
[[ -t 1 ]] || { c_red=''; c_grn=''; c_ylw=''; c_off=''; }
ok()   { echo "${c_grn}✓${c_off} $*"; }
warn() { echo "${c_ylw}!${c_off} $*"; }
fail() { echo "${c_red}✗${c_off} $*" >&2; }
die()  { fail "$*"; exit 1; }

env_get() { # Wert aus .env lesen (ohne die Datei auszuführen)
  grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-
}

# Wartet, bis alle Dienste laufen und die API „ready“ meldet (max. $1 Sekunden)
wait_healthy() {
  local timeout="${1:-180}" t=0 states
  while (( t < timeout )); do
    states="$(docker compose ps --format '{{.Service}}={{.State}}/{{.Health}}' 2>/dev/null | grep -v '^migrate=' || true)"
    if [[ -n "$states" ]] && ! grep -qvE '=running/(healthy|)$' <<<"$states"; then
      if docker compose exec -T api wget -qO- http://127.0.0.1:8080/api/health/ready >/dev/null 2>&1; then
        return 0
      fi
    fi
    if docker compose ps -a --format '{{.Service}}={{.State}} {{.ExitCode}}' 2>/dev/null | grep -qE '^migrate=exited [1-9]'; then
      fail "Migration fehlgeschlagen:"; docker compose logs --tail 20 migrate >&2; return 1
    fi
    sleep 3; t=$((t + 3))
  done
  fail "Zeitüberschreitung beim Warten auf gesunde Dienste:"; docker compose ps >&2
  return 1
}
