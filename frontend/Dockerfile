# Stage 1: Build do frontend com Vite
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

# SSO Portal CWO (Keycloak) — URL vista pelo browser do cliente
ARG VITE_KC_URL=http://localhost:8180
ARG VITE_KC_REALM=cwo
ARG VITE_KC_CLIENT_ID=inventory-manager
ENV VITE_KC_URL=${VITE_KC_URL} \
    VITE_KC_REALM=${VITE_KC_REALM} \
    VITE_KC_CLIENT_ID=${VITE_KC_CLIENT_ID}

RUN npm run build

# Stage 2: Servir com Nginx
FROM nginx:alpine

# Instala gettext para o envsubst e openssl para certificados temporários
RUN apk add --no-cache gettext openssl

# Remove a config padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia a config como template (será processada pelo envsubst no arranque)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copia os arquivos buildados
COPY --from=builder /app/dist /usr/share/nginx/html

# Copia páginas de erro personalizadas
COPY error_pages/50x.html /usr/share/nginx/html/50x.html
COPY error_pages/404.html /usr/share/nginx/html/404.html

# Copia o script de arranque
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Criar diretório para ACME challenges
RUN mkdir -p /var/www/certbot

EXPOSE 80 443

ENV BACKEND_HOST=api
ENV BACKEND_PORT=3000
# Origem do Keycloak permitida no CSP (SSO Portal CWO)
ENV KC_ORIGIN=http://localhost:8180

ENTRYPOINT ["/docker-entrypoint.sh"]
