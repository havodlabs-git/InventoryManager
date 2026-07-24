/**
 * auth.js — Módulo de Autenticação e Autorização RBAC para o Inventory Manager
 */

const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

const JWT_SECRET     = process.env.JWT_SECRET     || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

// Lista completa de permissões disponíveis
const ALL_PERMISSIONS = [
  "asset:list",
  "asset:read",
  "asset:create",
  "asset:update",
  "asset:delete",
  "customer:info",
  "user:manage",
  "apikey:manage"
];

// Permissões padrão para tokens de API (sem gestão)
const DEFAULT_API_PERMISSIONS = [
  "asset:list",
  "asset:read",
  "asset:create",
  "asset:update",
  "asset:delete",
  "customer:info"
];

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || (() => {
  const generated = crypto.randomBytes(32).toString("hex");
  console.warn("[AUTH] ADMIN_API_KEY não definida. Chave gerada automaticamente:");
  console.warn("[AUTH] X-Admin-Key:", generated);
  return generated;
})();

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function getApiKey(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^ApiKey\s+(.+)$/i);
  return m ? m[1] : null;
}

function validatePermissions(permissions) {
  if (!Array.isArray(permissions)) return null;
  const valid = permissions.filter(p => ALL_PERMISSIONS.includes(p));
  return valid.length > 0 ? valid : null;
}

function issueMasterToken(customerId, sessionToken = null, options = {}) {
  const expiresIn = options.expiresIn || JWT_EXPIRES_IN;
  return jwt.sign(
    {
      customerId,
      scope: "master",
      permissions: ALL_PERMISSIONS,
      sessionToken
    },
    JWT_SECRET,
    { expiresIn }
  );
}

function issueApiToken(customerId, permissions, options = {}) {
  const expiresIn = options.expiresIn || JWT_EXPIRES_IN;
  const validPerms = validatePermissions(permissions) || DEFAULT_API_PERMISSIONS;

  const payload = {
    customerId,
    scope: "api",
    permissions: validPerms
  };

  if (options.name) {
    payload.tokenName = options.name;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function issueUserToken(userId, customerId, role, sessionToken = null) {
  const rolePermissions = {
    admin:    ["asset:list", "asset:read", "asset:create", "asset:update", "asset:delete", "customer:info", "user:manage"],
    user:     ["asset:list", "asset:read", "asset:create", "asset:update", "asset:delete", "customer:info"],
    readonly: ["asset:list", "asset:read", "customer:info"]
  };

  return jwt.sign(
    {
      userId,
      customerId,
      role,
      scope: "user",
      permissions: rolePermissions[role] || rolePermissions.user,
      sessionToken
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function isAdmin(req) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (Boolean(ADMIN_API_KEY) && key === ADMIN_API_KEY) {
    return true;
  }

  // Permite autenticação de administradores via JWT Token
  let token = getBearerToken(req);
  if (!token && key && String(key).startsWith("ey")) {
    token = key;
  }

  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload && payload.role === "admin" && payload.customerId === "11111111-1111-1111-1111-111111111111") {
        return true;
      }
    } catch {
      // Ignorar erros de token expirado/inválido e continuar para validação normal
    }
  }
  return false;
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) {
    let customerId = null;
    let userId = null;
    const key = req.headers["x-admin-key"] || req.query.adminKey;
    let token = getBearerToken(req);
    if (!token && key && String(key).startsWith("ey")) {
      token = key;
    }
    if (token) {
      try {
        const payload = verifyToken(token);
        customerId = payload.customerId;
        userId = payload.userId;
      } catch {
        // Ignorar
      }
    }

    req.auth = { 
      type: "admin", 
      permissions: ALL_PERMISSIONS,
      customerId,
      userId
    };
    return next();
  }
  return res.status(401).json({ error: "ADMIN_KEY_REQUIRED" });
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.auth && (req.auth.type === "admin" || req.auth.type === "master")) {
      return next();
    }

    const perms = req.auth && req.auth.permissions;
    if (perms && Array.isArray(perms) && perms.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      error: "PERMISSION_DENIED",
      required: permission,
      granted: perms || []
    });
  };
}

function requireMaster({ customerIdResolver } = {}) {
  return async (req, res, next) => {
    // 1. Admin bypass
    if (isAdmin(req)) {
      req.auth = { type: "admin", permissions: ALL_PERMISSIONS };
      return next();
    }

    // 2. Tentar API Key
    const rawApiKey = getApiKey(req);
    if (rawApiKey) {
      try {
        const prefix = rawApiKey.substring(0, 12);
        const r = await pool.query(
          `SELECT ak.id, ak.customer_id, ak.key_hash, ak.status, ak.expires_at, ak.permissions
           FROM api_keys ak
           WHERE ak.prefix = $1 AND ak.status = 'active'`,
          [prefix]
        );

        if (r.rowCount === 0) {
          return res.status(401).json({ error: "INVALID_API_KEY" });
        }

        const keyRow = r.rows[0];

        if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
          return res.status(401).json({ error: "API_KEY_EXPIRED" });
        }

        const valid = await bcrypt.compare(rawApiKey, keyRow.key_hash);
        if (!valid) {
          return res.status(401).json({ error: "INVALID_API_KEY" });
        }

        // Atualizar last_used_at
        pool.query(
          "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
          [keyRow.id]
        ).catch(err => console.error("[AUTH] Erro ao atualizar last_used_at:", err));

        const keyPermissions = keyRow.permissions || DEFAULT_API_PERMISSIONS;

        req.auth = {
          type: "apikey",
          customerId: keyRow.customer_id,
          apiKeyId: keyRow.id,
          permissions: keyPermissions
        };

        const resolvedCustomerId = customerIdResolver ? customerIdResolver(req) : null;
        if (resolvedCustomerId && String(resolvedCustomerId) !== String(keyRow.customer_id)) {
          return res.status(403).json({ error: "CUSTOMER_MISMATCH" });
        }

        return next();
      } catch (err) {
        console.error("[AUTH] Erro na validação de API Key:", err);
        return res.status(500).json({ error: "INTERNAL_ERROR" });
      }
    }

    // 3. Tentar JWT Bearer
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    try {
      const payload = verifyToken(token);

      if (!payload || !payload.customerId) {
        return res.status(401).json({ error: "INVALID_TOKEN" });
      }

      if (!["master", "customer", "api"].includes(payload.scope)) {
        return res.status(401).json({ error: "INVALID_TOKEN_SCOPE" });
      }

      const isMaster = ["master", "customer"].includes(payload.scope);

      if (payload.sessionToken && isMaster) {
        const resDb = await pool.query("SELECT session_token FROM customers WHERE id = $1", [payload.customerId]);
        if (resDb.rowCount > 0 && resDb.rows[0].session_token && resDb.rows[0].session_token !== payload.sessionToken) {
          return res.status(401).json({ error: "SESSION_EXPIRED" });
        }
      }

      req.auth = {
        type: isMaster ? "master" : "api",
        customerId: payload.customerId,
        permissions: payload.permissions || (isMaster ? ALL_PERMISSIONS : DEFAULT_API_PERMISSIONS),
        payload
      };

      if (payload.tokenName) {
        req.auth.tokenName = payload.tokenName;
      }

      const resolvedCustomerId = customerIdResolver ? customerIdResolver(req) : null;
      if (resolvedCustomerId && String(resolvedCustomerId) !== String(payload.customerId)) {
        return res.status(403).json({ error: "CUSTOMER_MISMATCH" });
      }

      return next();
    } catch {
      return res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
    }
  };
}

function requireUser({ customerIdResolver, minRole } = {}) {
  const roleHierarchy = { readonly: 0, user: 1, admin: 2 };

  return async (req, res, next) => {
    if (isAdmin(req)) {
      req.auth = { type: "admin", permissions: ALL_PERMISSIONS };
      return next();
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    try {
      const payload = verifyToken(token);

      if (!payload || !payload.customerId) {
        return res.status(401).json({ error: "INVALID_TOKEN" });
      }

      if (!["master", "customer", "user", "api"].includes(payload.scope)) {
        return res.status(401).json({ error: "INVALID_TOKEN_SCOPE" });
      }

      if (payload.scope === "user" && minRole) {
        const userLevel = roleHierarchy[payload.role] ?? -1;
        const requiredLevel = roleHierarchy[minRole] ?? 0;
        if (userLevel < requiredLevel) {
          return res.status(403).json({ error: "INSUFFICIENT_ROLE" });
        }
      }

      const isMaster = ["master", "customer"].includes(payload.scope);

      if (payload.sessionToken) {
        let dbSessionToken = null;
        if (payload.scope === "user" && payload.userId) {
          const resDb = await pool.query("SELECT session_token FROM users WHERE id = $1", [payload.userId]);
          if (resDb.rowCount > 0) dbSessionToken = resDb.rows[0].session_token;
        } else if (isMaster) {
          const resDb = await pool.query("SELECT session_token FROM customers WHERE id = $1", [payload.customerId]);
          if (resDb.rowCount > 0) dbSessionToken = resDb.rows[0].session_token;
        }
        if (dbSessionToken && dbSessionToken !== payload.sessionToken) {
          return res.status(401).json({ error: "SESSION_EXPIRED" });
        }
      }

      req.auth = {
        type: isMaster ? "master" : (payload.scope === "user" ? "user" : "api"),
        customerId: payload.customerId,
        userId: payload.userId || null,
        role: payload.role || (isMaster ? "master" : "user"),
        permissions: payload.permissions || (isMaster ? ALL_PERMISSIONS : DEFAULT_API_PERMISSIONS),
        payload
      };

      const resolvedCustomerId = customerIdResolver ? customerIdResolver(req) : null;
      if (resolvedCustomerId && String(resolvedCustomerId) !== String(payload.customerId)) {
        return res.status(403).json({ error: "CUSTOMER_MISMATCH" });
      }

      return next();
    } catch {
      return res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
    }
  };
}

function requireMasterOnly({ customerIdResolver } = {}) {
  const base = requireMaster({ customerIdResolver });
  return (req, res, next) => {
    base(req, res, (err) => {
      if (err) return next(err);
      if (req.auth && req.auth.type === "user") {
        return res.status(403).json({ error: "MASTER_ACCOUNT_REQUIRED" });
      }
      if (req.auth && req.auth.type === "api") {
        return res.status(403).json({ error: "MASTER_ACCOUNT_REQUIRED" });
      }
      return next();
    });
  };
}

async function generateApiKey() {
  const raw = "ioc_" + crypto.randomBytes(32).toString("hex");
  const prefix = raw.substring(0, 12);
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  const keyHash = await bcrypt.hash(raw, rounds);
  return { rawKey: raw, prefix, keyHash };
}

module.exports = {
  ALL_PERMISSIONS,
  DEFAULT_API_PERMISSIONS,
  issueMasterToken,
  issueApiToken,
  issueUserToken,
  verifyToken,
  validatePermissions,
  isAdmin,
  requireAdmin,
  requireMaster,
  requireMasterOnly,
  requireUser,
  requirePermission,
  generateApiKey,
  getBearerToken,
  getApiKey
};
