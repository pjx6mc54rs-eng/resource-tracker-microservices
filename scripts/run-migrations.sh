#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SERVICES=("auth-service" "project-service" "timesheet-service" "reporting-service")

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

  if [ ! -x "$SERVICE/node_modules/.bin/typeorm-ts-node-commonjs" ]; then
    echo "→ Installation des dépendances ($SERVICE)..."
    (cd "$SERVICE" && npm install)
  fi

  cd "$SERVICE"
  echo "→ Exécution des migrations en attente uniquement (pas de génération)..."
  # Utiliser le binaire local (avec ts-node) — évite le téléchargement npx hors projet
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
