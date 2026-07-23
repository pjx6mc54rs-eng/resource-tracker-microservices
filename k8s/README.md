# Guide de Déploiement Kubernetes - Resource Tracker Microservices

## Structure du Projet Kubernetes

```
k8s/
├── kustomization.yaml          # Fichier principal Kustomize
├── namespaces/
│   └── namespace.yaml           # Namespace de l'application
├── configmaps/
│   ├── app-config.yaml          # Configuration générale
│   └── postgres-init.yaml       # Scripts d'initialisation PostgreSQL
├── secrets/
│   └── secrets.yaml             # Données sensibles (credentials)
├── pvcs/
│   └── pvc.yaml                 # PersistentVolumeClaims
├── postgres/
│   ├── postgres.yaml            # PostgreSQL Deployment + Service
│   └── pgadmin.yaml             # pgAdmin Deployment + Service
├── rabbitmq/
│   └── rabbitmq.yaml            # RabbitMQ Deployment + Service
├── services/
│   ├── auth-service.yaml        # Auth Service Deployment + Service
│   ├── project-service.yaml     # Project Service Deployment + Service
│   ├── timesheet-service.yaml   # Timesheet Service Deployment + Service
│   ├── notification-service.yaml # Notification Service Deployment + Service
│   ├── reporting-service.yaml   # Reporting Service Deployment + Service
│   ├── chat-service.yaml        # Chat Service Deployment + Service
│   ├── api-gateway.yaml         # API Gateway Deployment + Service (LoadBalancer)
│   ├── frontend.yaml            # Frontend Deployment + Service (LoadBalancer)
│   └── network-policies.yaml    # NetworkPolicies pour la sécurité
└── ingress/
    └── ingress.yaml             # Ingress Controller Configuration
```

## Prérequis

- Kubernetes 1.20+
- kubectl configuré
- Accès à un cluster Kubernetes (local ou cloud)
- Les images Docker construites et disponibles

## Installation et Déploiement

### 1. Créer le namespace et déployer l'application

```bash
# Déployer tous les manifests via Kustomize
kubectl apply -k k8s/

# OU déployer manuellement
kubectl apply -f k8s/namespaces/namespace.yaml
kubectl apply -f k8s/configmaps/
kubectl apply -f k8s/secrets/
kubectl apply -f k8s/pvcs/
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/rabbitmq/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress/
```

### 2. Vérifier l'état du déploiement

```bash
# Voir les pods
kubectl get pods -n resource-tracker

# Voir les services
kubectl get svc -n resource-tracker

# Voir les PVCs
kubectl get pvc -n resource-tracker

# Voir les ingress
kubectl get ingress -n resource-tracker

# Vérifier les logs d'un pod
kubectl logs -f deployment/auth-service -n resource-tracker
```

### 3. Accéder aux services

**API Gateway:**
```bash
kubectl port-forward svc/api-gateway 3005:3000 -n resource-tracker
# Accès: http://localhost:3005
```

**Frontend:**
```bash
kubectl port-forward svc/frontend 5173:80 -n resource-tracker
# Accès: http://localhost:5173
```

**pgAdmin:**
```bash
kubectl port-forward svc/pgadmin-service 5050:80 -n resource-tracker
# Accès: http://localhost:5050
# Email: admin@admin.com
# Password: admin
```

**RabbitMQ Management:**
```bash
kubectl port-forward svc/rabbitmq-service 15672:15672 -n resource-tracker
# Accès: http://localhost:15672
# Username: admin
# Password: admin
```

### Accès via Ingress NGINX

Ajoutez ces domaines dans `/etc/hosts` :

```text
127.0.0.1 app.resource-tracker.local api.resource-tracker.local pgadmin.resource-tracker.local rabbitmq.resource-tracker.local
```

Si le cluster Kind a été créé avec `k8s/kind-config.yaml`, les services sont disponibles directement sur le port `8080` :

- Frontend : [http://app.resource-tracker.local:8080](http://app.resource-tracker.local:8080)
- API Gateway : [http://api.resource-tracker.local:8080](http://api.resource-tracker.local:8080)
- pgAdmin : [http://pgadmin.resource-tracker.local:8080](http://pgadmin.resource-tracker.local:8080)
- RabbitMQ : [http://rabbitmq.resource-tracker.local:8080](http://rabbitmq.resource-tracker.local:8080)

Sinon, créez le port-forward NGINX dans un terminal et gardez-le ouvert :

```bash
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8080:80
```

N'utilisez pas ce port-forward si le mapping Kind utilise déjà le port `8080`.

### Port-forward pour les migrations

Avant d'exécuter `scripts/run-migrations-k8s.sh`, ouvrez un second terminal et gardez ce port-forward actif :

```bash
kubectl port-forward svc/postgres-service 5432:5432 -n resource-tracker
```

Ensuite, dans le terminal principal :

```bash
./scripts/run-migrations-k8s.sh
```

## Variables d'Environnement et Configuration

### ConfigMap (app-config.yaml)
Contient les variables de configuration non-sensibles:
- `PORT`: Port par défaut 3000
- `DATABASE_HOST`: postgres-service
- `RABBITMQ_URL`: amqp://admin:admin@rabbitmq-service:5672
- URLs des services internes

### Secrets (secrets.yaml)
Contient les données sensibles:
- `JWT_SECRET`: Secret pour JWT (à modifier en production)
- `DATABASE_PASSWORD`: Mot de passe PostgreSQL
- `RABBITMQ_DEFAULT_PASS`: Mot de passe RabbitMQ
- `CHAT_ENCRYPTION_KEY`: Clé de chiffrement du chat

## Montée en échelle (Scaling)

Pour augmenter le nombre de replicas d'un service:

```bash
# Augmenter les replicas du projet-service à 3
kubectl scale deployment project-service --replicas=3 -n resource-tracker

# Voir l'état des replicas
kubectl get deployment -n resource-tracker
```

## Mises à jour (Upgrades)

Pour mettre à jour une image de service:

```bash
# Mettre à jour l'image du service
kubectl set image deployment/auth-service \
  auth-service=resource-tracker-microservices:latest-auth-service \
  -n resource-tracker

# Voir le statut du rollout
kubectl rollout status deployment/auth-service -n resource-tracker

# Revenir à la version précédente en cas de problème
kubectl rollout undo deployment/auth-service -n resource-tracker
```

## Déploiement avec Ingress

### Configuration nécessaire:
1. Installer un Ingress Controller (ex: nginx-ingress)
2. Mettre à jour les domaines dans `ingress/ingress.yaml`
3. Configurer DNS ou /etc/hosts pour les domaines

### Domaines disponibles (à adapter):
- `api.resource-tracker.local` → API Gateway
- `app.resource-tracker.local` → Frontend
- `pgadmin.resource-tracker.local` → pgAdmin
- `rabbitmq.resource-tracker.local` → RabbitMQ Management

## Monitoring et Logs

```bash
# Voir les logs d'un déploiement
kubectl logs -f deployment/auth-service -n resource-tracker

# Voir les logs d'un pod spécifique
kubectl logs -f pod-name -n resource-tracker

# Décrire un pod pour voir les événements
kubectl describe pod pod-name -n resource-tracker

# Voir l'utilisation des ressources
kubectl top pods -n resource-tracker
```

## Debugging

```bash
# Accéder à un container pour déboguer
kubectl exec -it pod-name -n resource-tracker -- /bin/bash

# Vérifier la connectivité réseau
kubectl exec -it pod-name -n resource-tracker -- ping postgres-service

# Vérifier la configuration d'une variable d'environnement
kubectl exec -it pod-name -n resource-tracker -- env | grep DATABASE
```

## Suppression de l'application

```bash
# Supprimer tous les ressources du namespace
kubectl delete namespace resource-tracker

# OU supprimer les manifests via Kustomize
kubectl delete -k k8s/
```

## Points importants à modifier pour la Production

1. **Secrets**: Modifier les mots de passe par défaut dans `secrets/secrets.yaml`
2. **JWT_SECRET**: Générer une vraie clé secrète
3. **Replicas**: Augmenter le nombre de replicas pour la haute disponibilité
4. **Ressources**: Ajuster les limites de resources selon vos besoins
5. **Ingress**: Configurer les vrais domaines et certificats SSL/TLS
6. **StorageClass**: Adapter les PVCs selon votre infrastructure
7. **Logs**: Mettre en place une solution de logging (ELK, Loki, etc.)
8. **Monitoring**: Ajouter Prometheus/Grafana pour le monitoring

## Notes sur l'architecture

- **Namespace**: `resource-tracker` isolé et sécurisé
- **Replicas**: 2 pour chaque service (haute disponibilité)
- **Ressources**: Configurées de manière conservatrice
- **Health Checks**: Livenessprobes et ReadinessProbes configurées
- **Networking**: NetworkPolicies pour isoler le trafic
- **Secrets**: Gérés via Kubernetes Secrets (à remplacer par Sealed Secrets en production)
- **Configuration**: Séparée via ConfigMaps
