#!/bin/sh
# Render (and some other hosts) mount the persistent disk owned by root. The website itself runs as the unprivileged
# "node" user, so on start we give that user the data folder, then drop root before starting the server.
set -e
DATA="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  if [ "$(stat -c %u "$DATA")" != "$(id -u node)" ]; then chown -R node:node "$DATA"; fi
  exec su-exec node "$@"
fi
exec "$@"
