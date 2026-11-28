# Base images are pinned by digest (engineering standards S14.8, #463); Renovate (`docker:pinDigests`) moves tag and
# digest together. The deployed `runner` stage runs as the non-root `omuser`; `yarn dockerfiles:check` (in `yarn verify`)
# fails on an unpinned base or a root final stage.
#
# Vereino Enterprise (enterprise package spec DD-E12, #713): a build with the build argument `ENTERPRISE_REF` (a tag of
# the private repository `ENTERPRISE_REPO`) and `ENTERPRISE_TOKEN` (a fine-grained read-only token for that one
# repository, a Railway build variable) overlays `@vereino/enterprise` and builds with
# `NEXT_PUBLIC_VEREINO_ENTERPRISE=true`. The clone happens in the stage below, which no other stage copies anything
# from but the package sources, so the token never reaches the builder or the deployed image. Without `ENTERPRISE_REF`
# that stage yields an empty folder and every other stage does exactly what it did before.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS enterprise-source

ARG ENTERPRISE_REF=
ARG ENTERPRISE_REPO=wladku/vereino-enterprise
ARG ENTERPRISE_TOKEN=

RUN mkdir -p /enterprise \
 && if [ -n "$ENTERPRISE_REF" ]; then \
      apk add --no-cache git \
      && git clone --quiet --depth 1 --branch "$ENTERPRISE_REF" \
        "https://x-access-token:${ENTERPRISE_TOKEN}@github.com/${ENTERPRISE_REPO}.git" /enterprise \
      && rm -rf /enterprise/.git; \
    fi

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS builder

ARG ENTERPRISE_REF=
ENV NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/packages/app/node_modules/.bin:/app/node_modules/.bin:$PATH \
    NEXT_PUBLIC_VEREINO_ENTERPRISE=${ENTERPRISE_REF:+true}
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal
ARG NEXT_PUBLIC_DOCUMENTS_COLLAB_URL
ENV NEXT_PUBLIC_DOCUMENTS_COLLAB_URL=${NEXT_PUBLIC_DOCUMENTS_COLLAB_URL}

WORKDIR /app

RUN apk add --no-cache python3 make g++ ca-certificates openssl
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
# Workspace manifests first, so dependency installation stays cached until they change
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
# Root postinstall links framework sources for the agent guides; it must exist before yarn install
COPY scripts/link-framework-sources.mjs scripts/link-framework-sources.mjs
# The Enterprise overlay (DD-E12): the package from the clone stage (empty without `ENTERPRISE_REF`) and its script.
COPY --from=enterprise-source /enterprise /enterprise-src
COPY scripts/enterprise-overlay.mjs scripts/enterprise-overlay.mjs
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
# With the package, `enterprise-overlay.mjs` patches the app manifest, installs and checks that the lockfile resolves no
# third-party package the public lockfile does not; the patched manifest and lockfile are kept for `COPY . .` below.
RUN if [ -f /enterprise-src/package.json ]; then \
      mv /enterprise-src packages/enterprise \
      && node scripts/enterprise-overlay.mjs \
      && mkdir -p /enterprise-overlay \
      && cp packages/app/package.json yarn.lock /enterprise-overlay/; \
    else \
      yarn install; \
    fi
# What the runner needs of the package: its manifest and sources (an empty folder in a public build).
RUN mkdir -p /enterprise-image \
 && if [ -d packages/enterprise ]; then cp -R packages/enterprise/package.json packages/enterprise/src /enterprise-image/; fi

COPY . .
RUN if [ -d /enterprise-overlay ]; then \
      cp /enterprise-overlay/package.json packages/app/package.json \
      && cp /enterprise-overlay/yarn.lock yarn.lock; \
    fi
RUN yarn generate
RUN NODE_ENV=production yarn build

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/packages/app/node_modules/.bin:/app/node_modules/.bin:$PATH
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal

WORKDIR /app

RUN apk add --no-cache python3 make g++ ca-certificates openssl
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
# Workspace manifests first, so dependency installation stays cached until they change
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
# Root postinstall links framework sources for the agent guides; it must exist before yarn install
COPY scripts/link-framework-sources.mjs scripts/link-framework-sources.mjs
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
RUN yarn install

COPY . .

COPY docker/scripts/dev-entrypoint.sh /app/docker/scripts/dev-entrypoint.sh
COPY docker/scripts/init-or-migrate.sh /app/docker/scripts/init-or-migrate.sh
COPY packages/app/scripts/dev-encryption-preflight.mjs /app/docker/scripts/encryption-preflight.mjs
COPY docker/scripts/mcp-entrypoint.sh /app/docker/scripts/mcp-entrypoint.sh
RUN chmod +x /app/docker/scripts/dev-entrypoint.sh
RUN chmod +x /app/docker/scripts/init-or-migrate.sh
RUN chmod +x /app/docker/scripts/mcp-entrypoint.sh

EXPOSE 3000 4101
CMD ["/bin/sh", "/app/docker/scripts/dev-entrypoint.sh"]

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runner

ARG CONTAINER_PORT=3000
ARG DOCUMENTS_COLLAB_PORT=4101
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal
# Chromium backs the Documents PDF export (puppeteer-core). Build with
# --build-arg INSTALL_CHROMIUM=1 to include it; PDF export otherwise returns 503.
ARG INSTALL_CHROMIUM=0
# Enterprise (DD-E12): the CLI processes (pre-deploy, worker) read `src/modules.ts` at run time, so they need the same
# switch the build had; empty without `ENTERPRISE_REF`.
ARG ENTERPRISE_REF=

ENV NODE_ENV=production \
    DEMO_MODE=false \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/packages/app/node_modules/.bin:/app/node_modules/.bin:$PATH \
    PORT=${CONTAINER_PORT} \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NEXT_PUBLIC_VEREINO_ENTERPRISE=${ENTERPRISE_REF:+true}

WORKDIR /app

RUN if [ "$INSTALL_CHROMIUM" = "1" ]; then \
      apk add --no-cache ca-certificates chromium openssl; \
    else \
      apk add --no-cache ca-certificates openssl; \
    fi
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
# Workspace manifests first, so dependency installation stays cached until they change
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
# Root postinstall links framework sources for the agent guides; it must exist before yarn install
COPY scripts/link-framework-sources.mjs scripts/link-framework-sources.mjs
# Enterprise (DD-E12): the builder's patched app manifest and lockfile, and the package (manifest and sources). In a
# public build the builder's manifest and lockfile are the ones copied above and `/enterprise-image` is empty.
COPY --from=builder /app/packages/app/package.json packages/app/package.json
COPY --from=builder /app/yarn.lock yarn.lock
COPY --from=builder /enterprise-image /enterprise-image
RUN if [ -f /enterprise-image/package.json ]; then mv /enterprise-image packages/enterprise; else rmdir /enterprise-image; fi
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
RUN yarn workspaces focus @vereino/app --production
# The shared packages (`@vereino/ui`, `@vereino/db`) declare React and MikroORM as peer dependencies, which the app
# provides; a production install puts them only into `packages/app/node_modules`. Every `yarn mercato` process (the
# pre-deploy script, `yarn start`, the worker) loads their source outside the Next bundle, and Node resolves a package
# imported from `packages/<name>/src` by walking up to `packages/node_modules`: link it to the app's, so their peers
# resolve to the app's single copy (#727; checked by `scripts/image-smoke.sh`).
RUN ln -s app/node_modules packages/node_modules
# Enterprise (DD-E12): the overlaid package must resolve from the app, or the server would refuse to start.
RUN if [ -n "$ENTERPRISE_REF" ]; then \
      node -e "require.resolve('@vereino/enterprise/package.json', { paths: ['/app/packages/app'] })"; \
    fi

COPY --from=builder /app/packages/app/.mercato ./packages/app/.mercato
COPY --from=builder /app/packages/app/public ./packages/app/public
COPY --from=builder /app/packages/app/src ./packages/app/src
COPY --from=builder /app/packages/app/types ./packages/app/types
COPY --from=builder /app/packages/app/next.config.ts ./packages/app/next.config.ts
COPY --from=builder /app/packages/app/postcss.config.mjs ./packages/app/postcss.config.mjs
COPY --from=builder /app/packages/app/components.json ./packages/app/components.json
COPY --from=builder /app/packages/app/tsconfig.json ./packages/app/tsconfig.json
COPY --from=builder /app/packages/app/scripts ./packages/app/scripts
COPY --from=builder /app/packages/core/src ./packages/core/src
COPY --from=builder /app/packages/db/src ./packages/db/src
COPY --from=builder /app/packages/ui/src ./packages/ui/src
COPY --from=builder /app/scripts ./scripts
COPY docker/scripts/init-or-migrate.sh /app/docker/scripts/init-or-migrate.sh
COPY packages/app/scripts/dev-encryption-preflight.mjs /app/docker/scripts/encryption-preflight.mjs
# Used by the optional `mcp` service (compose profile `agents`).
COPY docker/scripts/mcp-entrypoint.sh /app/docker/scripts/mcp-entrypoint.sh
RUN chmod +x /app/docker/scripts/init-or-migrate.sh
RUN chmod +x /app/docker/scripts/mcp-entrypoint.sh

RUN adduser -D -u 1001 omuser \
 && chown -R omuser:omuser /app

USER omuser

EXPOSE ${CONTAINER_PORT} ${DOCUMENTS_COLLAB_PORT}
CMD ["yarn", "start"]
