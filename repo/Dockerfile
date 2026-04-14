# Shared deps stage — installs all dependencies once.
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g npm@11.12.1
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Test stage — runnable with `docker compose run --rm test`.
FROM node:20-alpine AS test
WORKDIR /app
RUN npm install -g npm@11.12.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "test"]

# Build stage — produces the static bundle.
FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g npm@11.12.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime stage — serves the static bundle.
FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["serve", "-s", "dist", "-l", "5000"]
