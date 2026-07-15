# chat-service

Microservice NestJS de discussion par projet. Il chiffre les messages en base, fournit l'historique REST et les mises à jour temps réel avec Socket.IO.

## Prérequis local

- PostgreSQL démarré sur `localhost:5432` ;
- `project-service` démarré sur `localhost:3001` ;
- une clé `CHAT_ENCRYPTION_KEY` de 64 caractères hexadécimaux dans `.env`.

## Démarrage local

```bash
npm install
npm run migration:run
npm run start:dev
```

Le service écoute sur `http://localhost:3006`.

## Docker

Depuis la racine du dépôt :

```bash
docker compose up -d --build postgres project-service chat-service
docker compose logs -f chat-service
```

Le port Docker `3000` est publié sur `http://localhost:3006`.

## API

- `GET /chat/:projectId/messages?limit=50&offset=0`
- Socket.IO : `joinProject`, `sendMessage`, `newMessage`

Toutes les opérations exigent un JWT valide et l'accès au projet.
