FROM node:24-bookworm-slim

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
