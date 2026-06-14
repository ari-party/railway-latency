# Base layer
FROM node:24-alpine AS base

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm fetch --frozen-lockfile

# Build layer
FROM base AS build

COPY . .

ARG WS_NAME="@railway-latency/control-plane"

RUN pnpm install --filter ${WS_NAME}...

RUN pnpm --filter ${WS_NAME}... build

RUN pnpm --filter ${WS_NAME} deploy --prod /output

# Package layer
FROM node:24-alpine AS package

RUN apk add --no-cache python3 py3-pip openssh-client \
  && python3 -m venv /opt/ansible-venv \
  && /opt/ansible-venv/bin/pip install --no-cache-dir 'ansible-core==2.17.*' \
  && ln -s /opt/ansible-venv/bin/ansible-playbook /usr/local/bin/ansible-playbook \
  && ln -s /opt/ansible-venv/bin/ansible-galaxy /usr/local/bin/ansible-galaxy

WORKDIR /railway-latency

COPY --from=build /output /railway-latency

COPY --from=build /workspace/apps/control-plane/dist/migrations ./dist/migrations
COPY --from=build /workspace/apps/control-plane/dist/templates ./dist/templates

COPY ansible ./ansible

RUN ansible-galaxy collection install -r ./ansible/requirements.yml \
      -p ./ansible/.ansible-collections

ENV ANSIBLE_COLLECTIONS_PATH=/railway-latency/ansible/.ansible-collections

CMD ["node", "/railway-latency/dist/index.js"]
