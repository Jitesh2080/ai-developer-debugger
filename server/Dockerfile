# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
# git is needed at runtime by simple-git; also present here for completeness.
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci
COPY shared shared
COPY server server
RUN npm run build --workspace shared && npm run build --workspace server
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 4000
# Run migrations then start the API.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
