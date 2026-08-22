ARG NODE_IMAGE=node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

FROM ${NODE_IMAGE} AS build
WORKDIR /build
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/action/package.json packages/action/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run build:core && npm run build:cli && npm run build:web

FROM ${NODE_IMAGE} AS mcp
LABEL org.opencontainers.image.source="https://github.com/aryamthecodebreaker/FixMap"
ENV NODE_ENV=production \
    HOME=/tmp/fixmap-home \
    FIXMAP_CACHE_DIR=/var/lib/fixmap/cache
WORKDIR /opt/fixmap
COPY --from=build --chown=node:node /build/node_modules ./node_modules
COPY --from=build --chown=node:node /build/packages/core/package.json ./packages/core/package.json
COPY --from=build --chown=node:node /build/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /build/packages/cli/package.json ./packages/cli/package.json
COPY --from=build --chown=node:node /build/packages/cli/dist ./packages/cli/dist
RUN mkdir -p /var/lib/fixmap/cache /workspace /tmp/fixmap-home && chown -R node:node /var/lib/fixmap /workspace /tmp/fixmap-home
USER node
VOLUME ["/var/lib/fixmap/cache", "/workspace"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["node", "/opt/fixmap/packages/cli/dist/cli.js", "--version"]
ENTRYPOINT ["node", "/opt/fixmap/packages/cli/dist/cli.js"]
CMD ["mcp", "--repo", "/workspace"]

FROM ${NODE_IMAGE} AS web
LABEL org.opencontainers.image.source="https://github.com/aryamthecodebreaker/FixMap"
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp/fixmap-home
WORKDIR /opt/fixmap
COPY --from=build --chown=node:node /build/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /build/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /build/apps/web/public ./apps/web/public
RUN mkdir -p /tmp/fixmap-home && chown -R node:node /tmp/fixmap-home
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
