# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
# VITE_API_BASE_URL is baked in at build time; override with --build-arg.
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace shared && npm run build --workspace client

# ---- runtime stage (static files via nginx) ----
FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
