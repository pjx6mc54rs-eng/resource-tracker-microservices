#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-desktop}"
NAMESPACE="resource-tracker"

# Services qui ont déjà "controllers: [AppController]"
SERVICES_WITH_CONTROLLERS=("project-service" "timesheet-service" "reporting-service")

# Services sans tableau controllers du tout
SERVICES_NO_CONTROLLERS=("auth-service" "chat-service")

create_health_file () {
  local SERVICE=$1
  local HEALTH_DIR="$SERVICE/src/health"
  local HEALTH_FILE="$HEALTH_DIR/health.controller.ts"

  if [ -f "$HEALTH_FILE" ]; then
    echo "✅ health.controller.ts existe déjà ($SERVICE)"
  else
    mkdir -p "$HEALTH_DIR"
    cat > "$HEALTH_FILE" << 'TS_EOF'
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
TS_EOF
    echo "✅ Créé : $HEALTH_FILE"
  fi
}

echo "============================================================"
echo "=== Services avec 'controllers: [AppController]' existant ==="
echo "============================================================"
for SERVICE in "${SERVICES_WITH_CONTROLLERS[@]}"; do
  echo "--- $SERVICE ---"
  MODULE_FILE="$SERVICE/src/app.module.ts"

  if [ ! -f "$MODULE_FILE" ]; then
    echo "❌ $MODULE_FILE introuvable — ignoré."
    continue
  fi

  create_health_file "$SERVICE"

  if grep -q "HealthController" "$MODULE_FILE"; then
    echo "✅ Déjà enregistré dans app.module.ts"
    continue
  fi

  cp "$MODULE_FILE" "$MODULE_FILE.bak"

  # Ajoute l'import après le dernier import, et HealthController dans controllers: [AppController]
  python3 - "$MODULE_FILE" << 'PY_EOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

if "HealthController" not in content:
    lines = content.split("\n")
    last_import_idx = max(i for i, l in enumerate(lines) if l.strip().startswith("import "))
    lines.insert(last_import_idx + 1, "import { HealthController } from './health/health.controller';")
    content = "\n".join(lines)

    content = re.sub(
        r"controllers\s*:\s*\[\s*AppController\s*\]",
        "controllers: [AppController, HealthController]",
        content
    )

    with open(path, "w") as f:
        f.write(content)
    print("✅ PATCHED")
else:
    print("⚠️  Déjà présent")
PY_EOF

  echo ""
done

echo "============================================================"
echo "=== Services SANS tableau controllers (auth-service, chat-service) ==="
echo "============================================================"
for SERVICE in "${SERVICES_NO_CONTROLLERS[@]}"; do
  echo "--- $SERVICE ---"
  MODULE_FILE="$SERVICE/src/app.module.ts"

  if [ ! -f "$MODULE_FILE" ]; then
    echo "❌ $MODULE_FILE introuvable — ignoré."
    continue
  fi

  create_health_file "$SERVICE"

  if grep -q "HealthController" "$MODULE_FILE"; then
    echo "✅ Déjà enregistré dans app.module.ts"
    continue
  fi

  cp "$MODULE_FILE" "$MODULE_FILE.bak"

  python3 - "$MODULE_FILE" << 'PY_EOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

if "HealthController" not in content:
    lines = content.split("\n")
    last_import_idx = max(i for i, l in enumerate(lines) if l.strip().startswith("import "))
    lines.insert(last_import_idx + 1, "import { HealthController } from './health/health.controller';")
    content = "\n".join(lines)

    # Ajoute "controllers: [HealthController]," juste après "@Module({"
    content = content.replace(
        "@Module({\n  imports: [",
        "@Module({\n  controllers: [HealthController],\n  imports: [",
        1
    )

    with open(path, "w") as f:
        f.write(content)
    print("✅ PATCHED")
else:
    print("⚠️  Déjà présent")
PY_EOF

  echo ""
done

echo "============================================================"
echo "=== Rebuild et rechargement des images dans Kind ==="
echo "============================================================"
ALL_SERVICES=("auth-service" "project-service" "timesheet-service" "reporting-service" "chat-service")

for SERVICE in "${ALL_SERVICES[@]}"; do
  IMAGE_NAME="resource-tracker-microservices-${SERVICE}:latest"
  echo "→ Build $IMAGE_NAME"
  docker build -t "$IMAGE_NAME" "./$SERVICE"

  echo "→ Chargement dans Kind (cluster: $KIND_CLUSTER_NAME)"
  kind load docker-image "$IMAGE_NAME" --name "$KIND_CLUSTER_NAME"
done

echo ""
echo "============================================================"
echo "=== Redémarrage des Deployments ==="
echo "============================================================"
kubectl rollout restart deployment "${ALL_SERVICES[@]}" -n "$NAMESPACE"

echo ""
echo "✅ Terminé. Suivez l'état avec :"
echo "   kubectl get pods -n $NAMESPACE"
