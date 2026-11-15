# Rayleigh in a container: docker build -t rayleigh . && docker run -p 3000:3000 -v rayleigh-data:/app/.data rayleigh
# (for your own copy of the app, installed from npm; in this repository, the packages come from the workspace)
FROM oven/bun:1.4.4 AS bun

FROM node:26-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:26-slim
# the database and uploads live in /app/.data: mount a volume there so they outlive the container
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    NUXT_ATELIER_DATABASE_URL=file:/app/.data/rayleigh.sqlite \
    NUXT_ATELIER_STORAGE_DIR=/app/.data/uploads \
    NUXT_ATELIER_MIGRATIONS_AUTO_APPLY=true
WORKDIR /app
COPY --from=build --chown=node:node /app/.output .output
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/_atelier/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
