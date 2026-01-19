FROM node:20-alpine

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Copy minimal workspace files first for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /app/
COPY apps/api/package.json /app/apps/api/package.json
COPY packages/db/package.json /app/packages/db/package.json
COPY packages/contracts/package.json /app/packages/contracts/package.json
COPY packages/config/package.json /app/packages/config/package.json

RUN pnpm install --frozen-lockfile

# Copy source
COPY . /app

WORKDIR /app/apps/api
EXPOSE 3001

CMD ["pnpm", "dev"]
