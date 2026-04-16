FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
COPY server/package.json ./server/package.json
RUN npm install --no-audit --no-fund
COPY web ./web
EXPOSE 5173
# Vite dev server; proxy target overridable so it points at the compose service.
ENV VITE_API_PROXY=http://server:4001
CMD ["npx", "-w", "web", "vite", "--host", "0.0.0.0"]
