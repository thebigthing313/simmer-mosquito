# check=skip=SecretsUsedInArgOrEnv

# The agency-facing SPA: built from the whole workspace, served by Caddy.
#
# Build context is the workspace root, not `apps/web` — the app compiles
# against six workspace packages through TypeScript project references, so a
# context scoped to its own directory could not resolve any of them. Railway
# finds this file through `RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile`; see
# docs/deployment.md.

# Debian rather than Alpine on purpose. The TypeScript 7 native compiler and
# rolldown both ship prebuilt linux binaries, and the ones this lockfile
# resolves are glibc — on musl the install succeeds and `tsc -b` then fails to
# find an executable it can run.
FROM node:22.16.0-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable

COPY . .

# Deliberately the whole workspace and not `--filter`: `tsc` lives in the root
# devDependencies, and an install that skips the root project has no compiler.
RUN pnpm install --frozen-lockfile

# Vite inlines these at build time, so they belong here rather than in the
# runtime image. Railway injects a service variable into a Docker build only
# for the names the Dockerfile declares as ARG — an undeclared one does not
# fail, it builds as an empty string and the app ships pointed at nothing.
#
# BuildKit's `SecretsUsedInArgOrEnv` check fires on the Mapbox name and is
# skipped at the top of this file. It is right about the mechanism and wrong
# about the value: `VITE_MAPBOX_ACCESS_TOKEN` is a *publishable* `pk.` token
# that Vite inlines into client JavaScript, so it is readable by anyone with
# the site open and there is nothing here to hide. A real secret must never be
# an ARG — it would be readable in the image history — and none of these are.
ARG VITE_SERVER_URL
ARG VITE_SHAPE_SERVER_URL
ARG VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_SERVER_URL=$VITE_SERVER_URL \
	VITE_SHAPE_SERVER_URL=$VITE_SHAPE_SERVER_URL \
	VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN

RUN pnpm --filter @simmer-mosquito/web build

# `dist` becomes a public document root one stage down, so nothing may be in it
# that was not meant to be read by a browser. `tsconfig.json` points
# `tsBuildInfoFile` out of the way for exactly this reason; this is the guard
# that says so out loud, because build metadata names every local source path.
RUN test ! -e apps/web/dist/tsconfig.tsbuildinfo

# Nothing from the build stage survives but the static output, so production
# runs no Node process at all.
FROM caddy:2-alpine AS runtime

COPY Caddyfile.static /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
