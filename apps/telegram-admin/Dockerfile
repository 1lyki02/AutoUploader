# Build from monorepo root:
#   docker build -f apps/telegram-admin/Dockerfile -t autouploader-telegram-admin .
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc .npmrc
COPY apps/telegram-admin/package.json apps/telegram-admin/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile --filter @autouploader/telegram-admin...

COPY packages/shared packages/shared
COPY packages/config packages/config
COPY apps/telegram-admin apps/telegram-admin

RUN pnpm --filter @autouploader/telegram-admin build

WORKDIR /app/apps/telegram-admin
EXPOSE 8787
CMD ["pnpm", "start"]
