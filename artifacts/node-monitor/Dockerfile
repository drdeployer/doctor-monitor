FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/node-monitor run build

EXPOSE 4173

CMD ["pnpm", "--filter", "@workspace/node-monitor", "run", "serve"]
