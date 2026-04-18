# Multi-stage build: deps → test | build → runtime (nginx for the SPA).
# Matches the shared team pattern — plain `npm ci`, no registry overrides.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Run npm ci and verify the install actually produced the test binary.
# Without the `test -x` guard, an `npm ci` that exited non-zero (or hit the
# npm 10.8.2 "Exit handler never called" bug on a flaky socket) can still
# leave a partial node_modules that BuildKit will happily cache — and every
# later build re-uses that broken layer until `docker builder prune` is run.
RUN npm ci --no-audit --no-fund \
 && test -x node_modules/.bin/vitest

FROM node:20-alpine AS test
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "test"]

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
  listen 5000 default_server;\n\
  listen [::]:5000 default_server;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf \
  && rm -f /etc/nginx/conf.d/default.conf.bak
EXPOSE 5000
CMD ["nginx", "-g", "daemon off;"]
