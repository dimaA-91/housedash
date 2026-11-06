FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
RUN chown -R 1000:1000 /data /config
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q -O /dev/null --header "Host: ${HOUSEDASH_HOSTNAME}.local" http://127.0.0.1:8080/housedash-root.crt
