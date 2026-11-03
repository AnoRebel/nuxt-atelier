# Build from the repo root: docker build -f docs/Dockerfile -t nuxt-atelier-docs .
FROM oven/bun:1.4.4 AS bun

FROM node:26-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
# no .git in the image, so skip installing git hooks
RUN SKIP_SIMPLE_GIT_HOOKS=1 bun install --frozen-lockfile
RUN bun run build && bun run docs:build

FROM node:26-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/docs/.output .output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
