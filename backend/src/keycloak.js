/**
 * keycloak.js — Validação de tokens do Portal CWO (Keycloak) para o Inventory Manager
 *
 * O portal autentica o cliente no Keycloak (realm "cwo"). Este módulo valida
 * esses tokens (RS256, via JWKS público do realm) sem qualquer chamada por
 * pedido — as chaves ficam em cache.
 *
 * Env:
 *   KEYCLOAK_URL     URL do Keycloak visto pelo BACKEND (ex.: http://keycloak:8080)
 *   KEYCLOAK_ISSUER  issuer esperado nos tokens (visto pelo BROWSER),
 *                    default http://localhost:8180/realms/cwo
 *   KEYCLOAK_REALM   default "cwo"
 */

const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8180";
const REALM = process.env.KEYCLOAK_REALM || "cwo";
const ISSUER =
  process.env.KEYCLOAK_ISSUER || `http://localhost:8180/realms/${REALM}`;
const JWKS_URI = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyKeycloakToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { issuer: ISSUER, algorithms: ["RS256"] },
      (err, decoded) => (err ? reject(err) : resolve(decoded))
    );
  });
}

/**
 * Middleware: exige um Bearer token válido do Keycloak com a role indicada.
 * Popula req.kc = { sub, email, username, name, customerId, roles }.
 */
function keycloakAuth(requiredRole) {
  return async (req, res, next) => {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "KEYCLOAK_TOKEN_REQUIRED" });

    try {
      const claims = await verifyKeycloakToken(m[1]);
      const roles = claims.realm_access?.roles || [];

      if (requiredRole && !roles.includes(requiredRole)) {
        return res.status(403).json({ error: "APP_NOT_CONTRACTED", requiredRole });
      }

      req.kc = {
        sub: claims.sub,
        email: claims.email,
        username: claims.preferred_username,
        name: claims.name,
        customerId: claims.customerId || null,
        roles,
      };
      return next();
    } catch (err) {
      return res
        .status(401)
        .json({ error: "INVALID_KEYCLOAK_TOKEN", detail: err.message });
    }
  };
}

module.exports = { keycloakAuth, verifyKeycloakToken };
