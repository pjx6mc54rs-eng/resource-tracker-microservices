# Configuration pour déployer localement avec Kind ou Minikube

# Pour Kind (Kubernetes in Docker):
# 1. Installer Kind: https://kind.sigs.k8s.io/docs/user/quick-start/
# 2. Créer un cluster:
#    kind create cluster --name resource-tracker --config kind-config.yaml
#
# kind-config.yaml:
# ```
# kind: Cluster
# apiVersion: kind.x-k8s.io/v1alpha4
# nodes:
# - role: control-plane
#   ports:
#   - containerPort: 80
#     hostPort: 80
#   - containerPort: 443
#     hostPort: 443
# - role: worker
# ```

# Pour Minikube:
# 1. Installer Minikube: https://minikube.sigs.k8s.io/docs/start/
# 2. Démarrer minikube:
#    minikube start --cpus=4 --memory=8192
# 3. Charger les images Docker:
#    eval $(minikube docker-env)
#    docker build -t resource-tracker-microservices:latest-auth-service ./auth-service
#    docker build -t resource-tracker-microservices:latest-project-service ./project-service
#    # ... faire de même pour tous les services

# Déployer avec Kustomize:
# kubectl apply -k k8s/

# Accéder aux services localement:
# kubectl port-forward svc/api-gateway 3005:3000 -n resource-tracker
# kubectl port-forward svc/frontend 5173:80 -n resource-tracker
# kubectl port-forward svc/pgadmin-service 5050:80 -n resource-tracker
# kubectl port-forward svc/rabbitmq-service 15672:15672 -n resource-tracker

# Pour nettoyer:
# kind delete cluster --name resource-tracker
# minikube delete
