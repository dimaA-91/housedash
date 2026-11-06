# syntax=docker/dockerfile:1.7
# HouseDash: compile on the development PC; install ARM64 runtime dependencies separately.
ARG NODE_VERSION=22
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
ARG BUILDARCH
ENV NEXT_TELEMETRY_DISABLED=1 HOUSEDASH_STANDALONE=1
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=housedash-build-npm-${BUILDARCH},target=/root/.npm \
    npm install --global "npm@$(node -p 'require("./package.json").engines.npm' | tr -d '>=^~ ')" \
    && npm ci --ignore-scripts --no-audit --no-fund
COPY . ./
RUN --mount=type=cache,id=housedash-next-${BUILDARCH},target=/src/.next/cache \
    HOUSEDASH_SKIP_DATA_INIT=1 npm run build
RUN node scripts/assemble-housedash.mjs

FROM node:${NODE_VERSION}-bookworm-slim AS runtime-deps
ARG TARGETARCH
WORKDIR /deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=housedash-runtime-npm-${TARGETARCH},target=/root/.npm \
    npm install --global "npm@$(node -p 'require("./package.json").engines.npm' | tr -d '>=^~ ')" \
    && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
# Der native Compiler (swc) wird nur zum Bauen gebraucht. Auf dem Pi läuft er nie: Start und Seiten wurden ohne ihn auf dem echten Image geprüft.
# Das spart rund 176 MB je Übertragung.
RUN rm -rf node_modules/@next/swc-*

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 UV_THREADPOOL_SIZE=8 NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /src/.next/housedash-runtime ./
COPY --from=runtime-deps --chown=node:node /deps/node_modules ./node_modules
RUN mkdir -p data public/backgrounds /run/housedash-voice && chown -R node:node data public/backgrounds /run/housedash-voice
USER node
VOLUME ["/app/data", "/app/public/backgrounds"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
