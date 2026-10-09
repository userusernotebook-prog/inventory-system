FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY frontend ./frontend
COPY public ./public
COPY src ./src
RUN npm run web:build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY server.js config.js db.js import-template.js workbook-reader.js ./
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
