FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest && npm ci --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm install -g npm@latest && npm ci --omit=dev --no-audit --no-fund --progress=false
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/data-source.js && node dist/main.js"]
