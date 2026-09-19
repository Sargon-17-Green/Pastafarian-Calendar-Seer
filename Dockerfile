FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS package
WORKDIR /src
COPY . .
RUN set -eux; \
    tgz="$(npm pack --silent)"; \
    test -n "$tgz"; \
    mv "$tgz" /tmp/seer.tgz

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
ARG TARGETARCH
RUN case "$TARGETARCH" in amd64|arm64) ;; *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 2 ;; esac
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ libgmp-dev libboost-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/seer
COPY --from=package /tmp/seer.tgz /tmp/seer.tgz
RUN npm init -y >/dev/null \
    && npm install --omit=dev --ignore-scripts /tmp/seer.tgz \
    && cd node_modules/pastafarian-calendar-seer \
    && SEER_ARCH="$TARGETARCH" SEER_RNS_BACKEND=portable npm run build:native \
    && npm test

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgmp10 libgmpxx4ldbl libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/seer
COPY --from=build --chown=node:node /opt/seer /opt/seer
COPY --from=package --chown=node:node /src/web /opt/seer-web
ENV HOST=0.0.0.0 \
    PORT=8080 \
    SEER_REQUIRE_ENGINE_SERVICE=1 \
    SEER_WEB_ROOT=/opt/seer-web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/_health/live',{signal:AbortSignal.timeout(1500)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "node_modules/pastafarian-calendar-seer/http/server.mjs"]
