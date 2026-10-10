# One image for both processes:
#   web:    docker run … mailed            (default command)
#   worker: docker run … mailed npm run worker
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd --system --uid 1001 mailed
COPY --from=build --chown=mailed /app/package.json ./package.json
COPY --from=build --chown=mailed /app/node_modules ./node_modules
COPY --from=build --chown=mailed /app/.next ./.next
COPY --from=build --chown=mailed /app/public ./public
COPY --from=build --chown=mailed /app/drizzle ./drizzle
COPY --from=build --chown=mailed /app/src ./src
COPY --from=build --chown=mailed /app/tsconfig.json /app/next.config.ts ./
USER mailed
EXPOSE 3000 2525
CMD ["npm", "start"]
