# WK-Planer: builds the client and runs the API server, which also serves the client.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm cache clean --force
ENV NODE_ENV=production API_PORT=8080
EXPOSE 8080
USER node
CMD ["npm", "start", "-w", "server"]
