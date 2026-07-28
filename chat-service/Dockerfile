FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm install --no-audit --no-fund --progress=false
COPY --from=build /app/dist ./dist
COPY --from=build /app/uploads ./uploads
EXPOSE 3000
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/data-source.js && node dist/main.js"]
