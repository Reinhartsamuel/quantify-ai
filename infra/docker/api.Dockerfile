FROM oven/bun:1.4.4

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tests ./tests
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3001
USER bun
CMD ["bun", "apps/api/src/server.ts"]
