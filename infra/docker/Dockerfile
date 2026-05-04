FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/peaq-integration/package.json ./packages/peaq-integration/
COPY apps/peaq-cli/package.json ./apps/peaq-cli/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json biome.json ./
COPY packages ./packages
COPY apps ./apps
WORKDIR /app/packages/peaq-integration
RUN pnpm build

FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
COPY --from=build /app/packages/peaq-integration/dist /app/packages/peaq-integration/dist
COPY --from=build /app/apps/peaq-cli/src /app/apps/peaq-cli/src
COPY --from=build /app/node_modules /app/node_modules

ENV NODE_ENV=production
USER nonroot:nonroot

ENTRYPOINT ["node", "/app/apps/peaq-cli/src/index.js"]
CMD ["status"]
