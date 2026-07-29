FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

ENV NODE_ENV=production \
    AUTODEVOPS_TRANSPORT=http \
    AUTODEVOPS_HOST=0.0.0.0 \
    AUTODEVOPS_PORT=8787

RUN addgroup -S autodevops && adduser -S -G autodevops autodevops
WORKDIR /app
COPY --from=build --chown=autodevops:autodevops /app/package.json ./
COPY --from=build --chown=autodevops:autodevops /app/node_modules ./node_modules
COPY --from=build --chown=autodevops:autodevops /app/dist ./dist

USER autodevops
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/health >/dev/null || exit 1
CMD ["node", "dist/index.js"]
