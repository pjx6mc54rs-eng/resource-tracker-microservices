FROM node:20-slim AS base
WORKDIR /app
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_MAXSOCKETS=3

FROM base AS build
COPY package*.json ./
RUN npm ci --no-audit --no-fund --progress=false && test -x node_modules/.bin/vite
COPY . .
RUN npm run build

FROM base
COPY --from=build /app/dist ./dist
RUN npm install -g serve --no-audit --no-fund --progress=false && npm cache clean --force
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
