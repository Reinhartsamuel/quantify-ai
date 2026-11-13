FROM oven/bun:1.4.4

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tests ./tests
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
USER bun
CMD ["bun", "apps/worker/src/index.ts"]
