# The operator console: built from the whole workspace, served by Caddy.
#
# Same shape as `apps/web/Dockerfile` and same reasons — read that one for the
# full commentary. What differs is the build-time variables and the filter.
# This service runs in Railway Serverless, so what it costs to start matters:
# the runtime stage is a static file server and nothing else.

FROM node:22.16.0-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

# The console has no maps by design, so no Mapbox token — see
# docs/deployment.md → "Admin service (Serverless)".
ARG VITE_SERVER_URL
ARG VITE_SIMMER_OPERATOR_ORG_ID
ENV VITE_SERVER_URL=$VITE_SERVER_URL \
	VITE_SIMMER_OPERATOR_ORG_ID=$VITE_SIMMER_OPERATOR_ORG_ID

RUN pnpm --filter @simmer-mosquito/admin build

# Nothing in the served directory that a browser was not meant to read — see
# apps/web/Dockerfile.
RUN test ! -e apps/admin/dist/tsconfig.tsbuildinfo

FROM caddy:2-alpine AS runtime

COPY Caddyfile.static /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/admin/dist /srv

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
