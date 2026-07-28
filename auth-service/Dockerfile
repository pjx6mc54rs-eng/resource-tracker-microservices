FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --progress=false
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm install --no-audit --no-fund --progress=false
COPY --from=build /app/dist ./dist
COPY --from=build /app/uploads ./uploads
EXPOSE 3000
CMD ["node", "dist/main"]