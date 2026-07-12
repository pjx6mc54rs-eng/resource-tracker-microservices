#!/bin/bash
set -e

SERVICES=("project-service" "timesheet-service" "reporting-service")

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

  cd "$SERVICE"
  echo "→ Exécution des migrations en attente uniquement (pas de génération)..."
  npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
  echo "✅ $SERVICE : migrations à jour"
  echo ""
  cd ..
done

echo "=== Tables actuelles ==="
docker exec -it postgres psql -U admin -d auth_db -c "\dt"
docker exec -it postgres psql -U admin -d project_db -c "\dt"
docker exec -it postgres psql -U admin -d timesheet_db -c "\dt"
docker exec -it postgres psql -U admin -d reporting_db -c "\dt"
