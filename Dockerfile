# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM oven/bun:1.3.11-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG CACHEBUST=1
RUN bun run build

# ── Stage 2: deps producción ─────────────────────────────────────────────────
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── Stage 3: runner PRODUCCIÓN ────────────────────────────────────────────────
FROM oven/bun:1.3.11-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist         ./dist
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "dist/src/main.js"]