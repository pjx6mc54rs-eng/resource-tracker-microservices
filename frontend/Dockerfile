FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest && npm ci --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g npm@latest && npm install --no-audit --no-fund --progress=false
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
