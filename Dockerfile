# syntax=docker/dockerfile:1
# Images: linux/amd64 and linux/arm64 (laptop), linux/arm/v7 (Pi Zero 2 W, 32-bit).
# node:22-bookworm-slim and python:3.12-slim-bookworm both publish linux/arm/v7.
# The Vite bundle is plain static files, so the Node stage runs on the builder
# (BUILDPLATFORM) instead of under QEMU. Only the Python stage is cross-built.

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Cap the V8 heap. CI builds natively and does not need the cap; a local build
# can override it with --build-arg NODE_OPTIONS=--max-old-space-size=...
ARG NODE_OPTIONS=--max-old-space-size=900
ENV NODE_OPTIONS=${NODE_OPTIONS}
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    DB_PATH=/data/dashboard.sqlite
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY --from=web /src/frontend/dist ./frontend/dist
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; port = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health')"
CMD ["python", "-m", "app"]
