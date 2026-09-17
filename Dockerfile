# The console is static files, so this is a build stage and a web server —
# there is no application process, nothing to keep alive, and no state.

FROM node:22-alpine AS build
WORKDIR /src

# Served at the origin root in a container, unlike the GitHub Pages deploy
# which lives under a repository prefix. One constant drives every asset URL,
# the manifest scope, and the worker's scope.
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/index.html >/dev/null || exit 1
