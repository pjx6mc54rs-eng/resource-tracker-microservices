FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install --no-audit --no-fund --progress=false
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
