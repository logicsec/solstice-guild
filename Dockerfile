FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
