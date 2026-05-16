FROM node:22-bookworm-slim

ENV CI=true \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false

RUN useradd --create-home --shell /usr/sbin/nologin forge

WORKDIR /workspace
USER forge

CMD ["node", "--version"]
