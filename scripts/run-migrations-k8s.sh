#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SERVICES=("auth-service" "project-service" "timesheet-service" "reporting-service" "chat-service")

export DATABASE_HOST="${DATABASE_HOST:-localhost}"
export DATABASE_PORT="${DATABASE_PORT:-5432}"
export DATABASE_USER="${DATABASE_USER:-admin}"
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-admin}"

echo "=== Vérification préalable : postgres doit être joignable ==="

# Check postgres availability via pg_isready, nc, or kubectl exec
if command -v pg_isready >/dev/null 2>&1; then
  CHECK_STATUS=$(pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" >/dev/null 2>&1 && echo "0" || echo "1")
elif command -v nc >/dev/null 2>&1; then
  CHECK_STATUS=$(nc -z "$DATABASE_HOST" "$DATABASE_PORT" >/dev/null 2>&1 && echo "0" || echo "1")
else
  CHECK_STATUS=$(kubectl get pod -n resource-tracker -l app=postgres -o jsonpath='{.items[0].status.phase}' 2>/dev/null | grep -q Running && echo "0" || echo "1")
fi

if [ "$CHECK_STATUS" != "0" ]; then
  echo "❌ Postgres n'est pas joignable sur $DATABASE_HOST:$DATABASE_PORT"
  echo "   Vérifiez que 'kubectl port-forward svc/postgres-service 5432:5432 -n resource-tracker' tourne bien dans un autre terminal."
  exit 1
fi
echo "✅ postgres est prêt"
echo ""

# Helper function to run psql queries locally or inside k8s pod
run_psql_cmd() {
  local DB="$1"
  local CMD="$2"
  if command -v psql >/dev/null 2>&1; then
    PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DB" -c "$CMD"
  else
    kubectl exec -n resource-tracker deployment/postgres -- psql -U "$DATABASE_USER" -d "$DB" -c "$CMD"
  fi
}

run_psql_select() {
  local DB="$1"
  local QUERY="$2"
  if command -v psql >/dev/null 2>&1; then
    PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DB" -tAc "$QUERY"
  else
    kubectl exec -n resource-tracker deployment/postgres -- psql -U "$DATABASE_USER" -d "$DB" -tAc "$QUERY"
  fi
}

for SERVICE in "${SERVICES[@]}"; do
  echo "============================================================"
  echo "=== $SERVICE ==="
  echo "============================================================"

  if [ ! -f "$SERVICE/src/data-source.ts" ]; then
    echo "❌ $SERVICE/src/data-source.ts est introuvable — ignoré."
    continue
  fi

  # Vérification et création automatique de la base de données si elle n'existe pas
  DB_NAME="${SERVICE%-service}_db"
  DB_EXISTS=$(run_psql_select postgres "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
  if [ "$DB_EXISTS" != "1" ]; then
    echo "→ Base de données '$DB_NAME' manquante. Création en cours..."
    run_psql_cmd postgres "CREATE DATABASE $DB_NAME;"
  else
    echo "✅ Base '$DB_NAME' déjà présente"
  fi

  if [ ! -x "$SERVICE/node_modules/.bin/typeorm-ts-node-commonjs" ]; then
    echo "→ Installation des dépendances ($SERVICE)..."
    (cd "$SERVICE" && npm install)
  fi

  echo "→ Migrations détectées :"
  if ls "$SERVICE"/src/migrations/*.ts >/dev/null 2>&1; then
    for MIGRATION_FILE in "$SERVICE"/src/migrations/*.ts; do
      echo "   - $(basename "$MIGRATION_FILE")"
    done
  else
    echo "   (aucune)"
  fi

  cd "$SERVICE"
  echo "→ Exécution des migrations en attente uniquement (pas de génération)..."
  ./node_modules/.bin/typeorm-ts-node-commonjs migration:run -d src/data-source.ts || true
  echo "✅ $SERVICE : migrations à jour"
  echo ""
  cd "$ROOT_DIR"
done

echo "=== Tables actuelles ==="
run_psql_cmd auth_db "\dt"
run_psql_cmd project_db "\dt"
run_psql_cmd timesheet_db "\dt"
run_psql_cmd reporting_db "\dt"
run_psql_cmd chat_db "\dt"

echo ""
echo "=== Vérification project_db (tâches ↔ collaborateurs) ==="
run_psql_cmd project_db "\d task_assignments"
run_psql_cmd project_db "SELECT id, timestamp, name FROM migrations ORDER BY id;"