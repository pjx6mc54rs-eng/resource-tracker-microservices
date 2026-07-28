FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --unsafe-perm=true --allow-root
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/uploads ./uploads
EXPOSE 3000
CMD ["node", "dist/main"]