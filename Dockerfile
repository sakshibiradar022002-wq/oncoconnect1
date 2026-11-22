# VELTRUVIA Server — container image for the API/static server only.
#
# The four desktop apps are Electron executables and are not built here.
# Runtime state (database, images, backups, .env) is mounted, never baked in.
#
#   docker build -t veltruvia-server .
#   docker run --rm -p 3000:3000 --env-file .env -v "$PWD/data:/data" veltruvia-server
#
# NOTE: this file is not exercised by CI (no Docker in the review workspace);
# validate it on the target host before relying on it.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY "VELTRUVIA Server/resources/app/package.json" "VELTRUVIA Server/resources/app/package-lock.json" ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/chemocure.db
WORKDIR /app

# Run unprivileged; /data is the only writable path the app needs.
RUN groupadd -r veltruvia && useradd -r -g veltruvia -d /app veltruvia \
 && mkdir -p /data && chown -R veltruvia:veltruvia /data

COPY --from=deps /app/node_modules ./node_modules
COPY "VELTRUVIA Server/resources/app/package.json" ./
COPY "VELTRUVIA Server/resources/app/src" ./src
COPY "VELTRUVIA Server/resources/app/public" ./public
COPY "VELTRUVIA Server/resources/app/electron" ./electron

VOLUME ["/data"]
EXPOSE 3000
USER veltruvia

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
