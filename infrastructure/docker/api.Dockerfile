# --- Nexora API build ---
FROM node:20-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/*/package.json packages/*/package.json
RUN npm install

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run build -w @nexora/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/node_modules ./node_modules
COPY apps/api/src/db/migrations ./apps/api/dist/db/migrations
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
