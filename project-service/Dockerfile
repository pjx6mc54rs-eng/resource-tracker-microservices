FROM node:20-slim AS base
WORKDIR /app
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_MAXSOCKETS=3

FROM base AS build
COPY package*.json ./
RUN npm ci --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM base
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --progress=false && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/data-source.js && node dist/main.js"]
