FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@12.3.3

COPY . .
RUN pnpm install --frozen-lockfile

ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173

CMD ["pnpm", "--filter", "@credaryn/verifier-web", "start"]
