#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SERVICES=("auth-service" "project-service" "timesheet-service" "reporting-service" "chat-service")

# Connexion via kubectl port-forward (svc/postgres-service 5432:5432 -n resource-tracker)
export DATABASE_HOST="${DATABASE_HOST:-localhost}"
export DATABASE_PORT="${DATABASE_PORT:-5432}"
export DATABASE_USER="${DATABASE_USER:-admin}"
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-admin}"

echo "=== Vérification préalable : postgres doit être joignable ==="
if ! pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" >/dev/null 2>&1; then
  echo "❌ Postgres n'est pas joignable sur $DATABASE_HOST:$DATABASE_PORT"
  echo "   Vérifiez que 'kubectl port-forward svc/postgres-service 5432:5432 -n resource-tracker' tourne bien dans un autre terminal."
  exit 1
fi
echo "✅ postgres est prêt"
echo ""

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
  DB_EXISTS=$(PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
  if [ "$DB_EXISTS" != "1" ]; then
    echo "→ Base de données '$DB_NAME' manquante. Création en cours..."
    PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
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
  ./node_modules/.bin/typeorm-ts-node-commonjs migration:run -d src/data-source.ts
  echo "✅ $SERVICE : migrations à jour"
  echo ""
  cd "$ROOT_DIR"
done

echo "=== Tables actuelles ==="
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d auth_db -c "\dt"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d project_db -c "\dt"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d timesheet_db -c "\dt"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d reporting_db -c "\dt"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d chat_db -c "\dt"

echo ""
echo "=== Vérification project_db (tâches ↔ collaborateurs) ==="
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d project_db -c "\d task_assignments"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U admin -d project_db -c "SELECT id, timestamp, name FROM migrations ORDER BY id;"