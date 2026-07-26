#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# renew-certs.sh — Renovação Automática do Certificado SSL via HTTP-01 Webroot
#
# Este script executa o Certbot via Docker usando o desafio webroot.
# Não precisa de intervenção manual no DNS (sem necessidade de registos TXT).
#
# Uso:
#   chmod +x renew-certs.sh
#   sudo ./renew-certs.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Configurações
DOMAIN="inventory.cwo.com.pt"
EMAIL="admin@cwo.com.pt"
CERTS_DIR="/root/certs"
LETSENCRYPT_DIR="/root/letsencrypt"
WEBROOT_DIR="/root/certbot-webroot"
FRONTEND_CONTAINER="r7-inventory-frontend"

echo "=========================================================="
echo " A iniciar processo de renovação automática do SSL para: "
echo " ${DOMAIN}"
echo "=========================================================="

# Garantir que as diretorias existem
mkdir -p "${CERTS_DIR}" "${LETSENCRYPT_DIR}" "${WEBROOT_DIR}"

# 1. Executar Certbot em modo Webroot
echo ""
echo "[1/4] A executar Certbot (HTTP-01 Webroot)..."
docker run --rm \
  -v "${LETSENCRYPT_DIR}:/etc/letsencrypt" \
  -v "${WEBROOT_DIR}:/var/www/certbot" \
  certbot/certbot:latest certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "${DOMAIN}" \
    --keep-until-expiring \
    --non-interactive

# 2. Copiar certificados para a diretoria montada no nginx
echo ""
echo "[2/4] A atualizar os certificados em ${CERTS_DIR}..."
if [ -f "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" ]; then
  cp -L "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" "${CERTS_DIR}/fullchain.pem"
  cp -L "${LETSENCRYPT_DIR}/live/${DOMAIN}/privkey.pem"   "${CERTS_DIR}/privkey.pem"
  chmod 600 "${CERTS_DIR}/privkey.pem"
  echo "  ✓ Certificados copiados com sucesso."
else
  echo "  ✗ Erro: Ficheiros de certificado não encontrados!"
  exit 1
fi

# 3. Recarregar o Nginx do container Frontend
echo ""
echo "[3/4] A recarregar Nginx no container '${FRONTEND_CONTAINER}'..."
if docker ps --format '{{.Names}}' | grep -q "^${FRONTEND_CONTAINER}$"; then
  docker exec "${FRONTEND_CONTAINER}" nginx -s reload
  echo "  ✓ Nginx do container reconfigurado e recarregado."
else
  echo "  ⚠ Aviso: O container '${FRONTEND_CONTAINER}' não está a correr. Inicie-o para aplicar os certificados."
fi

# 4. Recarregar o Nginx do Host
echo ""
echo "[4/4] A recarregar Nginx do Host..."
if systemctl is-active --quiet nginx; then
  sudo systemctl reload nginx
  echo "  ✓ Nginx do host recarregado com sucesso."
else
  echo "  ⚠ Aviso: Serviço nginx do host não está ativo ou não foi detetado (systemctl)."
  echo "  Se o host usar outro reverse proxy, recarregue-o manualmente."
fi

echo ""
echo "=========================================================="
echo " ✓ Processo concluído com sucesso!"
echo "=========================================================="
echo ""
