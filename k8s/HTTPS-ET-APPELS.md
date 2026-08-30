# Appels audio/vidéo en production — état réel de la plateforme

> Constaté sur la VM `instance-20260725-162024` (34.44.114.147) le 30 août 2026.

## L'essentiel

**HTTPS fonctionne déjà, il n'y a rien à installer.** Les appels sont
inaccessibles uniquement quand on ouvre le site en `http://` : les navigateurs
réservent l'accès au micro et à la caméra aux origines sûres, et sur une origine
en clair `navigator.mediaDevices` n'existe même pas.

Utiliser l'adresse sécurisée :

```
https://norsys-ressource-trucker.duckdns.org/messages
```

## Comment le trafic entre

Contrairement à ce que suggèrent `kind-config.yaml` et l'ingress, **le TLS n'est
pas terminé dans le cluster** :

```
navigateur ──HTTPS──► nginx de la VM (ports 80 et 443)
                      /etc/nginx/conf.d/resource-tracker.conf
                      certificat Let's Encrypt, en-têtes Upgrade pour WebSocket
                          │
                          └──HTTP──► NodePort de ingress-nginx (cluster kind)
                                         │
                                         └──► frontend / api-gateway
```

Le cluster ne voit donc que du HTTP en interne, et c'est normal. C'est aussi
pourquoi **cert-manager n'a pas lieu d'être ici** : le certificat est géré par
`certbot` sur la VM, pas par le cluster.

Vérifications faites :

| Contrôle | Résultat |
|---|---|
| `https://.../` | 200, chaîne TLS valide |
| Certificat | `CN=norsys-ressource-trucker.duckdns.org`, Let's Encrypt, valable jusqu'au 27/10/2026 |
| `GET /api/chat/ice-servers` sans jeton | 401 — la route d'appel est bien déployée |
| En-têtes WebSocket | `proxy_set_header Upgrade` présent sur les deux `proxy_pass` |

## Tester

Ouvrir **deux navigateurs différents** (ou une fenêtre de navigation privée) sur
`https://norsys-ressource-trucker.duckdns.org/messages`, avec deux comptes
distincts. Sélectionner la conversation directe correspondante : les boutons
d'appel audio et vidéo apparaissent dans l'en-tête. Le navigateur demandera
l'autorisation d'accéder au micro et à la caméra.

## Si l'appel sonne mais ne s'établit jamais

Message « La connexion a échoué. Un serveur TURN est probablement nécessaire. »
Les deux postes sont derrière des routeurs qui empêchent la liaison directe.
`TURN_URLS` est actuellement vide : seul STUN est utilisé, ce qui suffit dans la
plupart des cas mais pas derrière un NAT symétrique.

Lancer alors le relais **sur la VM, pas dans le cluster** : les ports UDP de
relais ne seraient pas joignables depuis l'intérieur de kind.

```bash
docker run -d --name coturn --network host --restart unless-stopped coturn/coturn -n --log-file=stdout --listening-port=3478 --realm=resource-tracker --use-auth-secret --static-auth-secret=change_this_turn_secret_in_production --min-port=49160 --max-port=49200 --external-ip=34.44.114.147 --no-tls --no-dtls --no-multicast-peers --fingerprint
```

Ouvrir les ports correspondants :

```bash
gcloud compute firewall-rules create allow-turn --allow tcp:3478,udp:3478,udp:49160-49200 --direction INGRESS
```

Puis renseigner le relais dans `k8s/configmaps/app-config.yaml` :

```yaml
TURN_URLS: "turn:34.44.114.147:3478?transport=udp,turn:34.44.114.147:3478?transport=tcp"
```

Le `TURN_SECRET` de `k8s/secrets/secrets.yaml` doit être **identique** au
`--static-auth-secret` ci-dessus : `chat-service` s'en sert pour dériver les
identifiants éphémères remis au navigateur. Changez les deux ensemble, et
remplacez la valeur par défaut avant tout usage réel.

## Diagnostic

Configuration ICE effectivement servie au navigateur (jeton d'un utilisateur
connecté, lisible dans le stockage local) :

```bash
curl -s -H "Authorization: Bearer VOTRE_JWT" https://norsys-ressource-trucker.duckdns.org/api/chat/ice-servers
```

Journaux de la signalisation :

```bash
kubectl -n resource-tracker logs -l app=chat-service --tail=100 -f
```

`chrome://webrtc-internals` reste l'outil le plus direct : il montre les
candidats collectés et l'état de la négociation, ce qui distingue un échec de
signalisation d'un échec de traversée de NAT.

## Entretien

Le certificat expire le 27 octobre 2026. `certbot` est installé sur la VM et
gère le renouvellement ; vérifier que le minuteur est actif :

```bash
systemctl list-timers | grep certbot
```
