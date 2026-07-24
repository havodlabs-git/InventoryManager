#!/bin/sh
set -e

CERT_DIR="/etc/nginx/certs"

# ─── 1. Processar template nginx com envsubst ──────────────────────────────────
export HTTPS_PORT=${HTTPS_PORT:-443}

envsubst '$BACKEND_HOST $BACKEND_PORT $KC_ORIGIN $HTTPS_PORT' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# ─── 2. Verificar se existem certificados no volume montado ───────────────────
if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
  echo "============================================================"
  echo "[INIT] Certificados SSL não encontrados em ${CERT_DIR}/"
  echo "[INIT]"
  echo "[INIT] A gerar certificados auto-assinados temporários"
  echo "[INIT] para o nginx poder arrancar."
  echo "============================================================"

  mkdir -p "${CERT_DIR}"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -days 365 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=inventory.cwo.com.pt" \
    2>/dev/null

  echo "[INIT] Certificados temporários gerados."
fi

# ─── 3. Testar configuração e arrancar nginx ──────────────────────────────────
echo "[INIT] A testar configuração do nginx..."
nginx -t

echo "[INIT] A iniciar nginx..."
exec nginx -g 'daemon off;'
