FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
ENV PORT=8795 DATA_DIR=/app/data
EXPOSE 8795
CMD ["node", "server/server.mjs"]
