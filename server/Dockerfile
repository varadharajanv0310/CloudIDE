FROM node:20-alpine
WORKDIR /app
# workspace-root package files for npm workspaces resolution
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund
COPY server ./server
EXPOSE 4001
CMD ["npx", "-w", "server", "tsx", "src/index.ts"]
