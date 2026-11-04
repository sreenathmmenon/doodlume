FROM node:22.16.0-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY public ./public
COPY index.html tsconfig.json vite.config.ts ./
RUN npm run check && ./node_modules/.bin/vite build

FROM node:22.16.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git curl ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/setup-container-runtime.sh /tmp/setup-runtime.sh
RUN sh /tmp/setup-runtime.sh && rm /tmp/setup-runtime.sh
WORKDIR /app
COPY package.json package-lock.json ./
# tsx is currently a development dependency but is the server entrypoint loader.
RUN npm ci --include=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY scripts/local-sam-worker.py ./scripts/local-sam-worker.py
COPY --from=web-build /app/dist ./dist
ENV NODE_ENV=production \
    CUTOUT_PROVIDER=local-sam2 \
    LOCAL_SAM_PYTHON=/opt/doodlume-runtime/bin/python \
    LOCAL_SAM_CHECKPOINT=/opt/doodlume-models/sam2.1_hiera_tiny.pt \
    LOCAL_LAMA_CHECKPOINT=/opt/doodlume-models/big-lama.pt \
    MODEL_PROVIDER=fireworks \
    MAX_MODEL_REQUESTS=20
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/index.ts"]
