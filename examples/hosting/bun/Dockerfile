# Nuxt Atelier on Bun, in a container. Build from your app's root: docker build -t my-site .
FROM oven/bun:1.4.4 AS bun

# Nuxt builds on Node; the server it builds runs on Bun
FROM node:26-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.4-slim
# SQLite and uploads live in /app/.data: mount a volume there so they outlive the container
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    NUXT_ATELIER_DATABASE_URL=file:/app/.data/atelier.sqlite \
    NUXT_ATELIER_STORAGE_DIR=/app/.data/uploads \
    NUXT_ATELIER_MIGRATIONS_AUTO_APPLY=true
WORKDIR /app
COPY --from=build --chown=bun:bun /app/.output .output
RUN mkdir -p /app/.data && chown bun:bun /app/.data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api/_atelier/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", ".output/server/index.mjs"]
