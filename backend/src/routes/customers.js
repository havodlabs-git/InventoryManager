/**
 * routes/customers.js — Rotas de Gestão de Tenants, Users, API Keys e Tokens do Inventory Manager
 */

const express = require("express");
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const { pool } = require("../db");
const {
  issueMasterToken,
  issueApiToken,
  issueUserToken,
  verifyToken,
  requireAdmin,
  requireMasterOnly,
  requireUser,
  requireMaster,
  requirePermission,
  generateApiKey,
  validatePermissions,
  ALL_PERMISSIONS,
  DEFAULT_API_PERMISSIONS
} = require("../auth");

const router = express.Router();

async function resolveUserPermissions(customerId, role) {
  const defaultRolePermissions = {
    admin:    ["asset:list", "asset:read", "asset:create", "asset:update", "asset:delete", "customer:info", "user:manage"],
    user:     ["asset:list", "asset:read", "asset:create", "asset:update", "asset:delete", "customer:info"],
    readonly: ["asset:list", "asset:read", "customer:info"]
  };

  try {
    const custRes = await pool.query(
      "SELECT rbac_rules FROM customers WHERE id = $1",
      [customerId]
    );
    if (custRes.rowCount === 0) return defaultRolePermissions[role] || defaultRolePermissions.user;
    
    const rbacRules = custRes.rows[0].rbac_rules;
    if (!rbacRules || !rbacRules[role]) {
      return defaultRolePermissions[role] || defaultRolePermissions.user;
    }

    const allowedPages = rbacRules[role];
    const perms = [];
    if (allowedPages.includes("dashboard")) {
      perms.push("customer:info");
    }
    if (allowedPages.includes("inventory")) {
      perms.push("asset:list", "asset:read", "asset:update");
    }
    if (allowedPages.includes("glpi_tickets")) {
      perms.push("asset:create", "asset:update");
    }
    if (allowedPages.includes("removal_requests")) {
      perms.push("asset:delete");
    }
    if (role === "admin") {
      perms.push("user:manage", "apikey:manage");
    }
    return Array.from(new Set(perms));
  } catch (err) {
    console.error("[resolveUserPermissions] Erro:", err);
    return defaultRolePermissions[role] || defaultRolePermissions.user;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function generateCustomerSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const VALID_DURATIONS = {
  "1h":   "1 hora",
  "6h":   "6 horas",
  "12h":  "12 horas",
  "24h":  "24 horas",
  "7d":   "7 dias",
  "30d":  "30 dias",
  "90d":  "90 dias",
  "180d": "180 dias",
  "365d": "365 dias"
};

// ─── Registo de Tenant ────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    const customerId     = uuidv4();
    const customerSecret = generateCustomerSecret();
    const rounds         = Number(process.env.BCRYPT_ROUNDS || 12);
    const secretHash     = await bcrypt.hash(customerSecret, rounds);

    await pool.query(
      `INSERT INTO customers (id, name, secret_hash, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [customerId, String(name).trim(), secretHash]
    );

    // Inicializar configuração Rapid7 vazia para este customer
    await pool.query(
      `INSERT INTO rapid7_configs (id, customer_id, sync_status, updated_at)
       VALUES ($1, $2, 'IDLE', NOW())`,
      [uuidv4(), customerId]
    );

    return res.status(201).json({
      customerId,
      customerSecret,
      warning: "Guarde o customerSecret em local seguro. Não será exibido novamente."
    });
  } catch (err) {
    console.error("[Register customer]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── Autenticação Master / User Login ─────────────────────────────────────────
router.post("/token/create", async (req, res) => {
  try {
    const { customerId, customerSecret } = req.body || {};
    if (!customerId)     return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });
    if (!customerSecret) return res.status(400).json({ error: "CUSTOMER_SECRET_REQUIRED" });

    // Verificar se o customerId é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(String(customerId).trim());

    if (!isUuid) {
      // Caso não seja um UUID, tratar como login de utilizador (GUI Console) usando e-mail
      const email = String(customerId).trim().toLowerCase();
      const userRes = await pool.query(
        `SELECT u.id, u.customer_id, u.password_hash, u.role, c.name AS customer_name 
         FROM users u 
         JOIN customers c ON c.id = u.customer_id 
         WHERE u.email = $1`,
        [email]
      );

      if (userRes.rowCount === 0) {
        return res.status(401).json({ error: "INVALID_CREDENTIALS" });
      }

      const user = userRes.rows[0];
      const ok = await bcrypt.compare(String(customerSecret), user.password_hash);
      if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
      const sessionToken = uuidv4();
      await pool.query("UPDATE users SET session_token = $1 WHERE id = $2", [sessionToken, user.id]);

      const resolvedPerms = await resolveUserPermissions(user.customer_id, user.role);
      const token = issueUserToken(user.id, user.customer_id, user.role, sessionToken, resolvedPerms);

      return res.status(200).json({
        token,
        tokenType: "Bearer",
        scope: "user",
        role: user.role,
        expiresIn: process.env.JWT_EXPIRES_IN || "12h",
        customerId: user.customer_id,
        customerName: user.customer_name
      });
    }

    // Caso padrão: Login Master do Cliente usando Customer ID (UUID)
    const custRes = await pool.query(
      "SELECT id, name, secret_hash FROM customers WHERE id = $1",
      [customerId]
    );
    if (custRes.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    const customer = custRes.rows[0];
    const ok = await bcrypt.compare(String(customerSecret), customer.secret_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CUSTOMER_SECRET" });

    const sessionToken = uuidv4();
    await pool.query("UPDATE customers SET session_token = $1 WHERE id = $2", [sessionToken, customerId]);

    const token = issueMasterToken(customerId, sessionToken);

    return res.status(200).json({
      token,
      tokenType: "Bearer",
      scope: "master",
      permissions: ALL_PERMISSIONS,
      expiresIn: process.env.JWT_EXPIRES_IN || "12h",
      customerId,
      customerName: customer.name
    });
  } catch (err) {
    console.error("[Token create]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── Geração de Token API ─────────────────────────────────────────────────────
router.post(
  "/token/generate",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const { name, permissions, expiresIn } = req.body || {};

      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: "TOKEN_NAME_REQUIRED" });
      }

      const duration = expiresIn || "12h";
      if (!VALID_DURATIONS[duration]) {
        return res.status(400).json({
          error: "INVALID_DURATION",
          validValues: Object.keys(VALID_DURATIONS),
          descriptions: VALID_DURATIONS
        });
      }

      let grantedPermissions = DEFAULT_API_PERMISSIONS;
      if (permissions && Array.isArray(permissions)) {
        const validated = validatePermissions(permissions);
        if (!validated) {
          return res.status(400).json({
            error: "INVALID_PERMISSIONS",
            validValues: ALL_PERMISSIONS
          });
        }
        grantedPermissions = validated.filter(p => !["user:manage", "apikey:manage"].includes(p));
      }

      const token = issueApiToken(customerId, grantedPermissions, {
        expiresIn: duration,
        name: String(name).trim()
      });

      const decoded = verifyToken(token);
      const expiresAt = new Date(decoded.exp * 1000).toISOString();

      return res.status(201).json({
        token,
        tokenType: "Bearer",
        scope: "api",
        name: String(name).trim(),
        permissions: grantedPermissions,
        expiresIn: duration,
        expiresInDescription: VALID_DURATIONS[duration],
        expiresAt,
        customerId,
        warning: "Guarde o token em local seguro. Não será possível recuperá-lo."
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.post("/token/auth", (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });

    const payload = verifyToken(String(token));
    return res.status(200).json({
      valid: true,
      scope: payload.scope,
      permissions: payload.permissions || [],
      customerId: payload.customerId,
      tokenName: payload.tokenName || null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      payload
    });
  } catch {
    return res.status(401).json({ valid: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }
});

router.get("/token/permissions", (req, res) => {
  const permissionDescriptions = {
    "asset:list":    "Listar assets do inventário",
    "asset:read":    "Ler detalhes de um asset específico",
    "asset:create":  "Adicionar assets manualmente",
    "asset:update":  "Atualizar dados dos assets",
    "asset:delete":  "Remover assets do inventário",
    "customer:info": "Consultar informação do tenant",
    "user:manage":   "Gerir utilizadores do tenant (apenas Master)",
    "apikey:manage": "Gerir API Keys do tenant (apenas Master)"
  };

  return res.status(200).json({
    permissions: ALL_PERMISSIONS.map(p => ({
      id: p,
      description: permissionDescriptions[p] || p,
      masterOnly: ["user:manage", "apikey:manage"].includes(p)
    })),
    validDurations: Object.entries(VALID_DURATIONS).map(([key, desc]) => ({
      value: key,
      description: desc
    }))
  });
});

// ─── Gestão de Users (GUI) ────────────────────────────────────────────────────
router.post("/user/register", async (req, res) => {
  try {
    const { customerId, customerSecret, email, password, role } = req.body || {};

    if (!customerId)     return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });
    if (!customerSecret) return res.status(400).json({ error: "CUSTOMER_SECRET_REQUIRED" });

    const normEmail = normalizeEmail(email);
    if (!normEmail || !normEmail.includes("@")) {
      return res.status(400).json({ error: "INVALID_EMAIL" });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: "WEAK_PASSWORD_MIN_8" });
    }

    const validRoles = ["admin", "user", "readonly"];
    const assignedRole = role && validRoles.includes(role) ? role : "user";

    const custRes = await pool.query(
      "SELECT id, secret_hash FROM customers WHERE id = $1",
      [customerId]
    );
    if (custRes.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    const ok = await bcrypt.compare(String(customerSecret), custRes.rows[0].secret_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CUSTOMER_SECRET" });

    const rounds       = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(String(password), rounds);
    const userId       = uuidv4();

    try {
      await pool.query(
        `INSERT INTO users (id, customer_id, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, customerId, normEmail, passwordHash, assignedRole]
      );
    } catch (err) {
      if (err && err.code === "23505") {
        return res.status(409).json({ error: "USER_ALREADY_EXISTS" });
      }
      throw err;
    }

    return res.status(201).json({
      userId,
      customerId,
      email: normEmail,
      role: assignedRole,
      createdAt: nowIso()
    });
  } catch (err) {
    console.error("[User register]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/user/login", async (req, res) => {
  try {
    const { customerId, email, password } = req.body || {};

    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const normEmail = normalizeEmail(email);
    if (!normEmail) return res.status(400).json({ error: "EMAIL_REQUIRED" });
    if (!password)  return res.status(400).json({ error: "PASSWORD_REQUIRED" });

    const custRes = await pool.query(
      "SELECT id FROM customers WHERE id = $1",
      [customerId]
    );
    if (custRes.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    const userRes = await pool.query(
      "SELECT id, password_hash, role FROM users WHERE customer_id = $1 AND email = $2",
      [customerId, normEmail]
    );
    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const user = userRes.rows[0];
    const ok   = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const sessionToken = uuidv4();
    await pool.query("UPDATE users SET session_token = $1 WHERE id = $2", [sessionToken, user.id]);

    const resolvedPerms = await resolveUserPermissions(customerId, user.role);
    const token = issueUserToken(user.id, customerId, user.role, sessionToken, resolvedPerms);

    return res.status(200).json({
      token,
      tokenType: "Bearer",
      scope: "user",
      role: user.role,
      expiresIn: process.env.JWT_EXPIRES_IN || "12h",
      userId: user.id,
      customerId
    });
  } catch (err) {
    console.error("[User login]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get(
  "/me",
  requireUser(),
  async (req, res) => {
    try {
      const { customerId, userId, role, type, permissions } = req.auth;

      const r = await pool.query(
        "SELECT id, name, rbac_rules, created_at FROM customers WHERE id = $1",
        [customerId]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

      const c = r.rows[0];
      const defaultRules = {
        admin: ["dashboard", "inventory", "glpi_tickets", "removal_requests"],
        user: ["dashboard", "inventory"],
        readonly: ["dashboard"]
      };

      const response = {
        customerId: c.id,
        name: c.name,
        createdAt: c.created_at,
        authType: type,
        permissions: permissions || [],
        rbacRules: c.rbac_rules || defaultRules
      };

      if (type === "user" && userId) {
        response.userId = userId;
        response.role   = role;
      }

      return res.status(200).json(response);
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.get(
  "/users",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const r = await pool.query(
        `SELECT id, email, role, created_at
         FROM users
         WHERE customer_id = $1
         ORDER BY created_at ASC`,
        [customerId]
      );

      return res.status(200).json({
        customerId,
        total: r.rowCount,
        data: r.rows.map(u => ({
          userId: u.id,
          email: u.email,
          role: u.role,
          createdAt: u.created_at
        }))
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.put(
  "/users/:userId/role",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role }   = req.body || {};

      const validRoles = ["admin", "user", "readonly"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          error: "INVALID_ROLE",
          validValues: validRoles
        });
      }

      const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const r = await pool.query(
        `UPDATE users
         SET role = $1
         WHERE id = $2 AND customer_id = $3
         RETURNING id, email, role, created_at`,
        [role, userId, customerId]
      );

      if (r.rowCount === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

      return res.status(200).json({
        userId: r.rows[0].id,
        email: r.rows[0].email,
        role: r.rows[0].role,
        updatedAt: nowIso()
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.delete(
  "/users/:userId",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const { userId }  = req.params;
      const customerId  = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;

      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const r = await pool.query(
        "DELETE FROM users WHERE id = $1 AND customer_id = $2 RETURNING id, email",
        [userId, customerId]
      );

      if (r.rowCount === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

      return res.status(200).json({
        success: true,
        userId: r.rows[0].id,
        email: r.rows[0].email
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// ─── Gestão de API Keys ───────────────────────────────────────────────────────
router.post(
  "/apikeys",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const { name, permissions, expiresIn, expiresAt } = req.body || {};
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: "API_KEY_NAME_REQUIRED" });
      }

      let expiresAtDate = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime()) || expiresAtDate <= new Date()) {
          return res.status(400).json({ error: "INVALID_EXPIRES_AT" });
        }
      } else if (expiresIn && VALID_DURATIONS[expiresIn]) {
        const now = new Date();
        const match = expiresIn.match(/^(\d+)(h|d)$/);
        if (match) {
          const amount = parseInt(match[1], 10);
          const unit = match[2];
          if (unit === "h") now.setHours(now.getHours() + amount);
          if (unit === "d") now.setDate(now.getDate() + amount);
          expiresAtDate = now;
        }
      }

      let grantedPermissions = DEFAULT_API_PERMISSIONS;
      if (permissions && Array.isArray(permissions)) {
        const validated = validatePermissions(permissions);
        if (!validated) {
          return res.status(400).json({
            error: "INVALID_PERMISSIONS",
            validValues: ALL_PERMISSIONS
          });
        }
        grantedPermissions = validated.filter(p => !["user:manage", "apikey:manage"].includes(p));
      }

      const { rawKey, prefix, keyHash } = await generateApiKey();
      const keyId = uuidv4();

      await pool.query(
        `INSERT INTO api_keys (id, customer_id, name, prefix, key_hash, status, permissions, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), $7)`,
        [keyId, customerId, String(name).trim(), prefix, keyHash, JSON.stringify(grantedPermissions), expiresAtDate]
      );

      return res.status(201).json({
        id: keyId,
        name: String(name).trim(),
        apiKey: rawKey,
        prefix,
        permissions: grantedPermissions,
        expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
        createdAt: nowIso(),
        warning: "Guarde a apiKey em local seguro. Não será exibida novamente."
      });
    } catch (err) {
      console.error("[API key create]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.get(
  "/apikeys",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const r = await pool.query(
        `SELECT id, name, prefix, status, permissions, created_at, expires_at, last_used_at
         FROM api_keys
         WHERE customer_id = $1
         ORDER BY created_at DESC`,
        [customerId]
      );

      return res.status(200).json({
        customerId,
        total: r.rowCount,
        data: r.rows.map(k => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          status: k.status,
          permissions: k.permissions || DEFAULT_API_PERMISSIONS,
          createdAt: k.created_at,
          expiresAt: k.expires_at,
          lastUsedAt: k.last_used_at
        }))
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.delete(
  "/apikeys/:keyId",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const { keyId }  = req.params;
      const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;

      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const r = await pool.query(
        `UPDATE api_keys
         SET status = 'revoked'
         WHERE id = $1 AND customer_id = $2 AND status = 'active'
         RETURNING id, name, prefix`,
        [keyId, customerId]
      );

      if (r.rowCount === 0) {
        return res.status(404).json({ error: "API_KEY_NOT_FOUND_OR_ALREADY_REVOKED" });
      }

      return res.status(200).json({
        success: true,
        id: r.rows[0].id,
        name: r.rows[0].name,
        prefix: r.rows[0].prefix,
        revokedAt: nowIso()
      });
    } catch {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// ─── Rotas de Administração (Blue Team) ──────────────────────────────────────
router.get("/list", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.id, c.name, c.created_at,
              COUNT(DISTINCT u.id)                                                    AS user_count,
              COUNT(DISTINCT ak.id) FILTER (WHERE ak.status = 'active')              AS active_api_keys,
              COUNT(DISTINCT a.id)                                                    AS asset_count
       FROM customers c
       LEFT JOIN users    u  ON u.customer_id  = c.id
       LEFT JOIN api_keys ak ON ak.customer_id = c.id
       LEFT JOIN assets   a  ON a.customer_id  = c.id
       GROUP BY c.id, c.name, c.created_at
       ORDER BY c.created_at DESC`
    );
    return res.status(200).json({
      total: r.rowCount,
      data: r.rows.map(row => ({
        id:            row.id,
        name:          row.name,
        createdAt:     row.created_at,
        userCount:     parseInt(row.user_count, 10),
        activeApiKeys: parseInt(row.active_api_keys, 10),
        assetCount:    parseInt(row.asset_count, 10)
      }))
    });
  } catch (e) {
    console.error("[ERROR] customer/list:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/delete", requireAdmin, async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "DELETE FROM customers WHERE id = $1 RETURNING id, name",
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    return res.status(200).json({ success: true, customerId: r.rows[0].id, name: r.rows[0].name });
  } catch {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/secret/rotate", requireAdmin, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const newSecret = generateCustomerSecret();
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const secretHash = await bcrypt.hash(newSecret, rounds);

    const r = await pool.query(
      "UPDATE customers SET secret_hash = $1, session_token = NULL WHERE id = $2 RETURNING id, name",
      [secretHash, id]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    return res.status(200).json({
      success: true,
      customerId: r.rows[0].id,
      customerName: r.rows[0].name,
      customerSecret: newSecret,
      warning: "Por favor, copie o novo segredo do cliente. Ele não será exibido novamente."
    });
  } catch (err) {
    console.error("[Rotate customer secret]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── Management of Users by Master Admin ─────────────────────────────────────
router.post(
  "/users",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const { email, password, role } = req.body || {};
      const normEmail = normalizeEmail(email);
      if (!normEmail || !normEmail.includes("@")) {
        return res.status(400).json({ error: "INVALID_EMAIL" });
      }
      if (!password || String(password).length < 8) {
        return res.status(400).json({ error: "WEAK_PASSWORD_MIN_8" });
      }

      const validRoles = ["admin", "user", "readonly"];
      const assignedRole = role && validRoles.includes(role) ? role : "user";

      const rounds       = Number(process.env.BCRYPT_ROUNDS || 12);
      const passwordHash = await bcrypt.hash(String(password), rounds);
      const userId       = uuidv4();

      try {
        await pool.query(
          `INSERT INTO users (id, customer_id, email, password_hash, role, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [userId, customerId, normEmail, passwordHash, assignedRole]
        );
      } catch (err) {
        if (err && err.code === "23505") {
          return res.status(409).json({ error: "USER_ALREADY_EXISTS" });
        }
        if (err && err.message === "USER_ALREADY_EXISTS") {
          return res.status(409).json({ error: "USER_ALREADY_EXISTS" });
        }
        throw err;
      }

      return res.status(201).json({
        userId,
        customerId,
        email: normEmail,
        role: assignedRole,
        createdAt: nowIso()
      });
    } catch (err) {
      console.error("[POST /users]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// ─── RBAC Configuration ───────────────────────────────────────────────────────
router.get(
  "/rbac",
  requireUser(),
  async (req, res) => {
    try {
      const { customerId } = req.auth;
      const r = await pool.query(
        "SELECT rbac_rules FROM customers WHERE id = $1",
        [customerId]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

      const defaultRules = {
        admin: ["dashboard", "inventory", "glpi_tickets", "removal_requests"],
        user: ["dashboard", "inventory"],
        readonly: ["dashboard"]
      };

      return res.status(200).json({
        rbacRules: r.rows[0].rbac_rules || defaultRules
      });
    } catch (err) {
      console.error("[GET /rbac]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

router.put(
  "/rbac",
  requireMasterOnly(),
  async (req, res) => {
    try {
      const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
      if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

      const { rbacRules } = req.body || {};
      if (!rbacRules || typeof rbacRules !== "object") {
        return res.status(400).json({ error: "INVALID_RBAC_RULES" });
      }

      const validRoles = ["admin", "user", "readonly"];
      const validPages = ["dashboard", "inventory", "glpi_tickets", "removal_requests"];

      for (const [role, pages] of Object.entries(rbacRules)) {
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: `INVALID_ROLE: ${role}` });
        }
        if (!Array.isArray(pages)) {
          return res.status(400).json({ error: `PAGES_MUST_BE_ARRAY_FOR_ROLE: ${role}` });
        }
        const invalidPage = pages.find(p => !validPages.includes(p));
        if (invalidPage) {
          return res.status(400).json({ error: `INVALID_PAGE: ${invalidPage} for role ${role}` });
        }
      }

      await pool.query(
        "UPDATE customers SET rbac_rules = $1 WHERE id = $2",
        [JSON.stringify(rbacRules), customerId]
      );

      return res.status(200).json({ success: true, rbacRules });
    } catch (err) {
      console.error("[PUT /rbac]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

module.exports = router;
