#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# init-letsencrypt.sh — Emissão de certificado Let's Encrypt via DNS-01
#
# Usa validação DNS-01 (manual) — NÃO precisa da porta 80 aberta.
# O Certbot vai pedir para criar um registo TXT no DNS do domínio.
#
# O certificado é copiado para /root/certs/ (volume montado no container).
#
# Uso:
#   chmod +x init-letsencrypt.sh
#   sudo ./init-letsencrypt.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ─── Configuração ─────────────────────────────────────────────────────────────
DOMAIN="inventory.cwo.com.pt"
EMAIL="admin@cwo.com.pt"            # Alterar para o email real
STAGING=0                            # 1 = modo teste (sem limites de rate)

# Caminhos no host
CERTS_DIR="/root/certs"              # Onde o docker run monta os certificados
LETSENCRYPT_DIR="/root/letsencrypt"  # Dados internos do Certbot

# Nome do container frontend
FRONTEND_CONTAINER="r7-inventory-frontend"

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Let's Encrypt — Certificado SSL via DNS-01          ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Domínio:      ${YELLOW}${DOMAIN}${NC}"
echo -e "Email:        ${YELLOW}${EMAIL}${NC}"
echo -e "Certificados: ${YELLOW}${CERTS_DIR}/${NC}"
echo -e "Método:       ${YELLOW}DNS-01 (manual)${NC}"
echo ""
echo -e "${CYAN}NOTA: O Certbot vai pedir para criar um registo TXT no DNS.${NC}"
echo -e "${CYAN}Terá de aceder ao painel DNS do domínio cwo.com.pt e criar:${NC}"
echo -e "${CYAN}  Nome:  _acme-challenge.inventory${NC}"
echo -e "${CYAN}  Tipo:  TXT${NC}"
echo -e "${CYAN}  Valor: (será mostrado pelo Certbot)${NC}"
echo ""
read -p "Continuar? (s/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  exit 0
fi

# ─── Criar diretórios ────────────────────────────────────────────────────────
mkdir -p "${CERTS_DIR}" "${LETSENCRYPT_DIR}"

# ─── 1. Verificar container frontend ─────────────────────────────────────────
echo ""
echo -e "${YELLOW}[1/4] A verificar container frontend...${NC}"
if docker ps --format '{{.Names}}' | grep -q "^${FRONTEND_CONTAINER}$"; then
  echo -e "${GREEN}  ✓ Container '${FRONTEND_CONTAINER}' a correr${NC}"
else
  echo -e "${YELLOW}  ⚠ Container '${FRONTEND_CONTAINER}' não encontrado (não é bloqueante para DNS-01)${NC}"
fi

# ─── 2. Emitir certificado via DNS-01 ────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/4] A solicitar certificado ao Let's Encrypt (DNS-01)...${NC}"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  ATENÇÃO: Quando o Certbot mostrar o valor TXT,      ${NC}"
echo -e "${CYAN}  vá ao painel DNS e crie o registo. Depois de criar,  ${NC}"
echo -e "${CYAN}  aguarde 1-2 minutos e pressione Enter no Certbot.   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

STAGING_ARG=""
if [ "$STAGING" -eq 1 ]; then
  STAGING_ARG="--staging"
  echo -e "${YELLOW}  (Modo staging — certificado de teste)${NC}"
fi

docker run --rm -it \
  -v "${LETSENCRYPT_DIR}:/etc/letsencrypt" \
  certbot/certbot:latest certonly \
    --manual \
    --preferred-challenges dns \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "${DOMAIN}" \
    ${STAGING_ARG}

# ─── 3. Copiar certificados para /root/certs ─────────────────────────────────
echo ""
echo -e "${YELLOW}[3/4] A copiar certificados para ${CERTS_DIR}/...${NC}"

if [ -f "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" ]; then
  cp -L "${LETSENCRYPT_DIR}/live/${DOMAIN}/fullchain.pem" "${CERTS_DIR}/fullchain.pem"
  cp -L "${LETSENCRYPT_DIR}/live/${DOMAIN}/privkey.pem"   "${CERTS_DIR}/privkey.pem"
  chmod 600 "${CERTS_DIR}/privkey.pem"
  echo -e "${GREEN}  ✓ fullchain.pem e privkey.pem copiados${NC}"
else
  echo -e "${RED}  ✗ Certificados não encontrados. A emissão pode ter falhado.${NC}"
  exit 1
fi

# ─── 4. Recarregar nginx ─────────────────────────────────────────────────────
echo -e "${YELLOW}[4/4] A recarregar nginx...${NC}"
if docker ps --format '{{.Names}}' | grep -q "^${FRONTEND_CONTAINER}$"; then
  docker exec "${FRONTEND_CONTAINER}" nginx -s reload
  echo -e "${GREEN}  ✓ Nginx recarregado${NC}"
else
  echo -e "${YELLOW}  ⚠ Container não encontrado. Reinicie o frontend manualmente.${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Certificado Let's Encrypt ativo!                  ${NC}"
echo -e "${GREEN}  ✓ Cadeado verde em https://${DOMAIN}                ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Para renovar (a cada ~90 dias), execute novamente:"
echo -e "  ${YELLOW}sudo ./init-letsencrypt.sh${NC}"
echo ""
echo -e "${CYAN}NOTA: Como usa DNS-01 manual, a renovação automática${NC}"
echo -e "${CYAN}não é possível sem um plugin DNS (ex: Cloudflare).${NC}"
echo -e "${CYAN}O certificado é válido por 90 dias.${NC}"
echo ""
