FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY package.json entrypoint.sh server.js treasury.js treasury.html treasury-ui.js treasury-public.js mailer.js sms.js api-client.js script.js arena.js sabiha-config.js index.html admin.html dashboard.html president.html secretary.html treasurer.html site-editor.html status.html security.html dba.html style.css ./
COPY assets ./assets
COPY photos ./photos
COPY voice ./voice
COPY sabiha ./sabiha
COPY vendor ./vendor
COPY scripts ./scripts
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh && mkdir -p /data && chown -R node:node /data /app
# No "USER node" here on purpose: entrypoint.sh fixes the disk ownership as root, then runs the server as node (su-exec).
ENTRYPOINT ["/app/entrypoint.sh"]
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]
