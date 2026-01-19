FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml /app/
COPY apps/worker/package.json /app/apps/worker/package.json
COPY packages/db/package.json /app/packages/db/package.json

RUN pnpm install

COPY . /app

WORKDIR /app/apps/worker
CMD ["pnpm", "dev"]
