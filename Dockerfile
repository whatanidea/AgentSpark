FROM node:24-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run typecheck && npm run build

FROM python:3.12-slim-bookworm AS dependencies
WORKDIR /build
COPY requirements.lock ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --only-binary=:all: --require-hashes -r requirements.lock \
    && /opt/venv/bin/pip check

FROM python:3.12-slim-bookworm AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="AgentSpark" \
      org.opencontainers.image.revision=$VCS_REF
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    DEMO_ARCHIVE_PATH=/home/agentsense/.agentspark/decisions.sqlite3
WORKDIR /app
RUN useradd --create-home --uid 10001 agentsense \
    && mkdir /home/agentsense/.agentspark \
    && chown 10001:10001 /home/agentsense/.agentspark
COPY --from=dependencies /opt/venv /opt/venv
COPY app/ ./app/
COPY governance_rules.yaml ./
COPY --from=frontend /frontend/dist ./frontend/dist
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).close()"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
