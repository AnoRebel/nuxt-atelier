# Nuxt Atelier on Deno, in a container. Build from your app's root: docker build -t my-site .
FROM oven/bun:1.4.4 AS bun

# Nuxt builds on Node; the server it builds runs on Deno
FROM node:26-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM denoland/deno:2.9.8
# SQLite and uploads live in /app/.data: mount a volume there so they outlive the container
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    NUXT_ATELIER_DATABASE_URL=file:/app/.data/atelier.sqlite \
    NUXT_ATELIER_STORAGE_DIR=/app/.data/uploads \
    NUXT_ATELIER_MIGRATIONS_AUTO_APPLY=true
WORKDIR /app
COPY --from=build --chown=deno:deno /app/.output .output
RUN mkdir -p /app/.data && chown deno:deno /app/.data
USER deno
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["deno", "eval", "fetch('http://127.0.0.1:3000/api/_atelier/health/ready').then(r => Deno.exit(r.ok ? 0 : 1), () => Deno.exit(1))"]
# SQLite's driver is a native module: it needs --allow-ffi and --allow-sys besides the preset's own permissions
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-sys", "--allow-ffi", "--unstable-byonm", "--unstable-node-globals", ".output/server/index.mjs"]
