FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8795 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
EXPOSE 8795
CMD ["node", "server/server.mjs"]
