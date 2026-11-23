# TERPGRID API – mehrstufiger Build, Laufzeit als unprivilegierter Benutzer „node“.
FROM node:22.21-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

FROM node:22.21-alpine3.22
ENV NODE_ENV=production \
    FILE_STORAGE_DIR=/data/files
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY package.json ./
# Datei-Volume gehört dem Laufzeitbenutzer; Anwendungscode bleibt root-eigen (nicht beschreibbar)
RUN mkdir -p /data/files && chown node:node /data/files && chmod 700 /data/files
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health/ready >/dev/null || exit 1
CMD ["node", "dist/index.js"]
