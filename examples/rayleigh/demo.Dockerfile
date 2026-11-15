# Nuxt Atelier's live demo: this example in demo mode, from the workspace's packages.
# Build from the repository's root: docker build -f examples/rayleigh/demo.Dockerfile -t nuxt-atelier-demo .
FROM oven/bun:1.4.4 AS bun

FROM node:26-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
# no .git in the image, so skip installing git hooks
RUN SKIP_SIMPLE_GIT_HOOKS=1 bun install --frozen-lockfile
RUN bun run build && cd examples/rayleigh && ATELIER_DEMO=true bun run build

FROM node:26-slim
# the template database is made and seeded on start; each visitor's copy lives in the temporary directory
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    NUXT_ATELIER_DATABASE_URL=file:/app/.data/rayleigh.sqlite \
    NUXT_ATELIER_STORAGE_DIR=/app/.data/uploads \
    NUXT_ATELIER_MIGRATIONS_AUTO_APPLY=true \
    NUXT_ATELIER_AUTH_TRUST_PROXY=true
WORKDIR /app
COPY --from=build --chown=node:node /app/examples/rayleigh/.output .output
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/_atelier/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
