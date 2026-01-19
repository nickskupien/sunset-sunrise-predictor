FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /app/
COPY apps/web/package.json /app/apps/web/package.json
COPY packages/contracts/package.json /app/packages/contracts/package.json
COPY packages/config/package.json /app/packages/config/package.json

RUN pnpm install --frozen-lockfile

COPY . /app

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["pnpm", "dev"]
