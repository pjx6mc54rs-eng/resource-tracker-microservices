#!/usr/bin/env bash
# Build and run Resource Tracker on a local Kind cluster.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${KIND_CLUSTER_NAME:-desktop}"
NAMESPACE="resource-tracker"
INGRESS_MANIFEST="https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.13.3/deploy/static/provider/kind/deploy.yaml"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

for command in docker kind kubectl; do
  require_command "$command"
done

if [[ "${1:-}" == "--reset" ]]; then
  if kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
    echo "Deleting Kind cluster: $CLUSTER_NAME"
    kind delete cluster --name "$CLUSTER_NAME"
  fi
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--reset]" >&2
  exit 1
fi

if ! kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
  echo "Cleaning up any stale containers for cluster: $CLUSTER_NAME"
  docker rm -f "${CLUSTER_NAME}-control-plane" "${CLUSTER_NAME}-worker" >/dev/null 2>&1 || true
  echo "Creating Kind cluster: $CLUSTER_NAME"
  kind create cluster --name "$CLUSTER_NAME" --config "$ROOT_DIR/k8s/kind-config.yaml"
fi

kubectl config use-context "kind-$CLUSTER_NAME" >/dev/null

if ! kubectl get deployment ingress-nginx-controller -n ingress-nginx >/dev/null 2>&1; then
  echo "Installing ingress-nginx controller"
  kubectl apply -f "$INGRESS_MANIFEST"
fi

echo "Building application images"
services=(
  auth-service
  project-service
  timesheet-service
  reporting-service
  chat-service
  notification-service
  api-gateway
  frontend
)
images=()

for service in "${services[@]}"; do
  image="resource-tracker-microservices-${service}:latest"
  docker build --tag "$image" "$ROOT_DIR/$service"
  images+=("$image")
done

echo "Loading images into Kind"
kind load docker-image --name "$CLUSTER_NAME" "${images[@]}"

echo "Applying Kubernetes manifests"
kubectl apply -k "$ROOT_DIR/k8s"

echo "Waiting for ingress-nginx"
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=180s

echo "Waiting for Resource Tracker deployments"
for deployment in postgres rabbitmq auth-service project-service timesheet-service reporting-service chat-service notification-service api-gateway frontend; do
  kubectl rollout status "deployment/$deployment" -n "$NAMESPACE" --timeout=180s
done

cat <<'EOF'

Resource Tracker is running.

Add these entries to /etc/hosts once:
127.0.0.1 app.resource-tracker.local api.resource-tracker.local pgadmin.resource-tracker.local rabbitmq.resource-tracker.local

Open: http://app.resource-tracker.local:8080
EOF
