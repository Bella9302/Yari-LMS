
# YARI Academy: one image for the web app and its tools (migrations, nightly job, demo seed).

# The full (not -slim) image already has OpenSSL and CA certificates, which Prisma's migration
# engine needs, so no system packages are installed.
FROM public.ecr.aws/docker/library/node:22-bookworm AS build
WORKDIR /app
# Prisma reads the datasource URL while generating the client; nothing connects during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# Security headers (CSP, HTTPS upgrade) are fixed at build time from these.
ARG APP_URL
ARG DEMO_MODE=false
ARG S3_REGION=af-south-1
ARG S3_ENDPOINT=
# Only for a demo behind a tunnel, e.g. "*.trycloudflare.com". Leave empty on a real server.
ARG SERVER_ACTIONS_ALLOWED_ORIGINS=
ENV APP_URL=$APP_URL DEMO_MODE=$DEMO_MODE S3_REGION=$S3_REGION S3_ENDPOINT=$S3_ENDPOINT \
  SERVER_ACTIONS_ALLOWED_ORIGINS=$SERVER_ACTIONS_ALLOWED_ORIGINS
RUN npm run build && rm -rf .next/cache

FROM public.ecr.aws/docker/library/node:22-bookworm
WORKDIR /app
RUN mkdir -p /data/storage && chown node:node /data/storage
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 STORAGE_LOCAL_DIR=/data/storage
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# Apply any new database migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx next start -H 0.0.0.0 -p 3000"]
