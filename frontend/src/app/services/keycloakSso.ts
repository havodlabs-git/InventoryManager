/**
 * keycloakSso.ts — Entrada via Portal CWO (SSO Keycloak) no Inventory Manager
 *
 * Fluxo:
 *   1. Sem sessão local, a app tenta sempre o SSO (exceto ?admin=1).
 *   2. check-sso: se existir sessão do portal, autentica sem pedir senha;
 *      se NÃO existir, redireciona para a página de login central (Keycloak).
 *   3. trySsoLogin() troca o token do Keycloak pelo token LOCAL da app
 *      (POST /api/auth/sso) e devolve o AuthData que a app já usa hoje.
 */

import Keycloak from 'keycloak-js';
import type { AuthData } from '@/app/components/AuthForm';

const KC_URL = import.meta.env.VITE_KC_URL || 'http://localhost:8180';
const KC_REALM = import.meta.env.VITE_KC_REALM || 'cwo';
const KC_CLIENT_ID = import.meta.env.VITE_KC_CLIENT_ID || 'inventory-manager';

const SSO_FLAG = 'cwo_sso_attempt_r7';

export const keycloak = new Keycloak({
  url: KC_URL,
  realm: KC_REALM,
  clientId: KC_CLIENT_ID,
});

/** true quando a app deve tentar SSO neste arranque */
export function shouldTrySso(): boolean {
  const params = new URLSearchParams(window.location.search);
  // ?sso=1 → veio do card do Portal CWO
  if (params.get('sso') === '1') return true;
  // callback do Keycloak (regresso do redirect de check-sso)
  if (params.has('state') && (params.has('code') || params.has('session_state') || params.has('iss'))) {
    return sessionStorage.getItem(SSO_FLAG) === '1';
  }
  return false;
}

/**
 * Tenta autenticar via sessão SSO do portal.
 * @returns AuthData local ou null se não houver sessão / app não contratada.
 */
export async function trySsoLogin(): Promise<AuthData | null> {
  try {
    sessionStorage.setItem(SSO_FLAG, '1');

    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      redirectUri: window.location.origin + '/?sso=1',
    });

    if (!authenticated || !keycloak.token) {
      // Se não houver sessão ativa do Keycloak e não formos uma callback de redirecionamento,
      // redirecionamos o browser diretamente para a página de login do Keycloak.
      const params = new URLSearchParams(window.location.search);
      const isCallback = params.has('state') && (params.has('code') || params.has('session_state'));
      if (!isCallback) {
        await keycloak.login({
          redirectUri: window.location.origin + '/?sso=1',
        });
      }
      return null;
    }

    // Troca o token Keycloak pelo token local da app
    const res = await fetch('/api/auth/sso', {
      method: 'POST',
      headers: { Authorization: `Bearer ${keycloak.token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[SSO] Falha na troca de token:', err);
      return null;
    }

    const data = await res.json();

    return {
      customerId: data.customerId,
      customerSecret: '',
      customerName: data.customerName || 'Cliente CWO',
      token: data.token,
    };
  } catch (err) {
    console.error('[SSO] Erro no check-sso:', err);
    return null;
  } finally {
    sessionStorage.removeItem(SSO_FLAG);
    // Limpa os parâmetros do callback do Keycloak da barra de endereço
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
}

/**
 * Termina a sessão local E a sessão central do Keycloak.
 * Funciona mesmo quando o keycloak-js não foi inicializado neste page load
 * (ex.: a app foi recarregada com o token local ainda válido no localStorage).
 */
export async function ssoLogout(): Promise<void> {
  const redirectUri = window.location.origin;

  if (keycloak.didInitialize && keycloak.authenticated) {
    await keycloak.logout({ redirectUri });
    return;
  }

  // Fallback: endpoint de logout do realm (o Keycloak pede confirmação
  // quando não há id_token_hint — comportamento esperado)
  const url =
    `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/logout` +
    `?client_id=${encodeURIComponent(KC_CLIENT_ID)}` +
    `&post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}
