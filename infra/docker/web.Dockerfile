FROM oven/bun:1.4.4 AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY tests ./tests
RUN bun install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S quant && adduser -S quant -G quant
COPY --from=build --chown=quant:quant /app/apps/web/.next/standalone ./
COPY --from=build --chown=quant:quant /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=quant:quant /app/apps/web/public ./apps/web/public
USER quant
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
