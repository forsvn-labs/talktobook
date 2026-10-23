# TalkToBook — Python engine needs pandoc (system binary) + WeasyPrint's
# native libs, and optionally Calibre for Kindle AZW3. A container is the
# smallest thing that makes pandoc + Python coexist. This image is for local
# reproduction. Do not treat talktobook.com as ours; there is no host deploy
# in this change.

FROM oven/bun:1 AS ui
WORKDIR /ui
COPY webapp/ui/package.json webapp/ui/bun.lock* ./
RUN bun install
COPY webapp/ui ./
RUN bun run build

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

ARG INSTALL_CALIBRE=false
RUN apt-get update && apt-get install -y --no-install-recommends \
      pandoc \
      libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev \
      libcairo2 fonts-dejavu fonts-liberation \
    && if [ "$INSTALL_CALIBRE" = "true" ]; then \
         apt-get install -y --no-install-recommends calibre; \
       fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY webapp/requirements.txt /srv/requirements.txt
RUN pip install -r /srv/requirements.txt

COPY scripts /srv/scripts
COPY webapp /srv/webapp
COPY --from=ui /ui/dist /srv/webapp/ui/dist

RUN python /srv/webapp/scripts/gen-social-assets.py

WORKDIR /srv/webapp
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --no-server-header --no-date-header --header server:TalkToBook"]
