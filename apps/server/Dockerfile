FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/automation/package.json packages/automation/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY packages/automation packages/automation
COPY packages/shared packages/shared
COPY packages/config packages/config

RUN pnpm --filter @autouploader/automation exec patchright install --with-deps chromium
RUN pnpm --filter @autouploader/automation exec camoufox-js fetch
RUN pnpm --filter @autouploader/server build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@autouploader/server", "start"]
