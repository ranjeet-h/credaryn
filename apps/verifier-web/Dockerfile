FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553

WORKDIR /app

RUN npm install --global pnpm@12.3.3

COPY . .
RUN chmod -R a+rX /app \
    && pnpm install --frozen-lockfile

ENV HOST=0.0.0.0
ENV PORT=4173
USER node
EXPOSE 4173

CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/verifier-web/src/server.ts"]
