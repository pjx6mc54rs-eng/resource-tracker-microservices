#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SERVICES=("auth-service" "project-service" "timesheet-service" "reporting-service" "chat-service")

# Connexion depuis la machine hôte (hors réseau Docker)
export DATABASE_HOST="${DATABASE_HOST:-localhost}"
export DATABASE_PORT="${DATABASE_PORT:-5432}"
export DATABASE_USER="${DATABASE_USER:-admin}"
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-admin}"

echo "=== Vérification préalable : postgres doit être démarré et healthy ==="
if ! docker-compose ps postgres | grep -q "healthy"; then
  echo "❌ Le conteneur postgres n'est pas 'healthy'."
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
  DB_EXISTS=$(docker exec postgres psql -U "$DATABASE_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
  if [ "$DB_EXISTS" != "1" ]; then
    echo "→ Base de données '$DB_NAME' manquante. Création en cours..."
    docker exec postgres psql -U "$DATABASE_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
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
  # Utiliser le binaire local (avec ts-node) — évite le téléchargement npx hors projet
  # Inclut notamment pour project-service :
  #   - 1783872815132-InitSchema.ts
  #   - 1783872815133-AddTaskAssignedUserId.ts
  #   - 1783872815134-TaskAssignmentsMultiUsers.ts
  ./node_modules/.bin/typeorm-ts-node-commonjs migration:run -d src/data-source.ts
  echo "✅ $SERVICE : migrations à jour"
  echo ""
  cd "$ROOT_DIR"
done

echo "=== Tables actuelles ==="
docker exec postgres psql -U admin -d auth_db -c "\dt"
docker exec postgres psql -U admin -d project_db -c "\dt"
docker exec postgres psql -U admin -d timesheet_db -c "\dt"
docker exec postgres psql -U admin -d reporting_db -c "\dt"
docker exec postgres psql -U admin -d chat_db -c "\dt"

echo ""
echo "=== Vérification project_db (tâches ↔ collaborateurs) ==="
docker exec postgres psql -U admin -d project_db -c "\d task_assignments"
docker exec postgres psql -U admin -d project_db -c "SELECT id, timestamp, name FROM migrations ORDER BY id;"
