/**
 * routes/assets.js — Rotas de Inventário de Assets e Configurações de Integração
 */

const express = require("express");
const multer  = require("multer");
const xlsx    = require("xlsx");
const { v4: uuidv4 } = require("uuid");

const { pool } = require("../db");
const { requireUser, requirePermission } = require("../auth");
const { syncCustomerAssets, getLogs } = require("../services/r7service");
const glpiService = require("../services/glpiservice");

const router = express.Router();

// Configurar multer em memória para o import de Excel
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // limite de 5MB
});

function normalizeStr(x) {
  return String(x || "").trim();
}

function parseBool(v, defaultValue) {
  if (v === undefined || v === null) return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

// ─── GET /api/assets/list ────────────────────────────────────────────────────
router.get("/list", requireUser(), requirePermission("asset:list"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const { search, type, module, status, riskLevel } = req.query;

    let query = "SELECT * FROM assets WHERE customer_id = $1 AND (os ILIKE '%microsoft%' OR os ILIKE '%windows%' OR os ILIKE '%ubuntu%')";
    const params = [customerId];

    // Filtro de pesquisa livre (Nome, IP, OS)
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR ip_address ILIKE $${params.length} OR os ILIKE $${params.length})`;
    }

    // Filtro por Tipo de Asset
    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    // Filtro por Módulo / Origem
    if (module) {
      params.push(module);
      query += ` AND module = $${params.length}`;
    }

    // Filtro por Status
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    // Filtro por Severidade de Risco
    if (riskLevel) {
      if (riskLevel === "CRITICAL") {
        query += " AND risk_score >= 850";
      } else if (riskLevel === "HIGH") {
        query += " AND risk_score >= 600 AND risk_score < 850";
      } else if (riskLevel === "MEDIUM") {
        query += " AND risk_score >= 300 AND risk_score < 600";
      } else if (riskLevel === "LOW") {
        query += " AND risk_score < 300";
      }
    }

    query += " ORDER BY risk_score DESC, updated_at DESC";

    const r = await pool.query(query, params);

    return res.status(200).json({
      customerId,
      total: r.rowCount,
      data: r.rows
    });
  } catch (err) {
    console.error("[List assets]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/add (Manual) ───────────────────────────────────────────
router.post("/add", requireUser(), requirePermission("asset:create"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const { name, type, ipAddress, macAddress, os, riskScore, vulnerabilitiesCount } = req.body || {};

    if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
    if (!type) return res.status(400).json({ error: "TYPE_REQUIRED" });

    const id = uuidv4();
    const externalId = `manual-${id.substring(0, 8)}`;
    const score = riskScore !== undefined ? Math.min(Math.max(Number(riskScore), 0), 1000) : 0;
    const vulns = vulnerabilitiesCount !== undefined ? Math.max(Number(vulnerabilitiesCount), 0) : 0;

    const status = req.body.status || "Online";
    const version = req.body.version || "N/A";
    const connection = req.body.connection || "Manual";
    const lastSeen = req.body.lastSeen || new Date().toLocaleString();

    const r = await pool.query(
      `INSERT INTO assets (id, customer_id, name, type, ip_address, mac_address, os, module, external_id, status, risk_score, vulnerabilities_count, version, connection, last_seen, last_scanned_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Manual', $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        id,
        customerId,
        normalizeStr(name),
        normalizeStr(type),
        ipAddress ? normalizeStr(ipAddress) : null,
        macAddress ? normalizeStr(macAddress) : null,
        os ? normalizeStr(os) : "Unknown OS",
        externalId,
        normalizeStr(status),
        score,
        vulns,
        normalizeStr(version),
        normalizeStr(connection),
        normalizeStr(lastSeen)
      ]
    );

    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("[Add asset manual]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── DELETE /api/assets/:id ──────────────────────────────────────────────────
router.delete("/:id", requireUser(), requirePermission("asset:delete"), async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;

    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "DELETE FROM assets WHERE id = $1 AND customer_id = $2 RETURNING *",
      [id, customerId]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "ASSET_NOT_FOUND" });

    return res.status(200).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error("[Delete asset]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── GET /api/assets/config (Rapid7 Connection Configurations) ───────────────
router.get("/config", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "SELECT * FROM rapid7_configs WHERE customer_id = $1",
      [customerId]
    );

    if (r.rowCount === 0) {
      // Cria registro padrão se não existir
      const defaultId = uuidv4();
      const insertRes = await pool.query(
        `INSERT INTO rapid7_configs (id, customer_id, sync_status, updated_at)
         VALUES ($1, $2, 'IDLE', NOW())
         RETURNING *`,
        [defaultId, customerId]
      );
      return res.status(200).json({ data: maskConfigPassword(insertRes.rows[0]) });
    }

    return res.status(200).json({ data: maskConfigPassword(r.rows[0]) });
  } catch (err) {
    console.error("[Get rapid7 config]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── PUT /api/assets/config (Update Rapid7 Configuration) ────────────────────
router.put("/config", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const body = req.body || {};
    const insightvmUrl = body.insightvmUrl ?? body.insightvm_url;
    const insightvmUser = body.insightvmUser ?? body.insightvm_user;
    const insightvmPassword = body.insightvmPassword ?? body.insightvm_password;
    const insightvmEnabled = body.insightvmEnabled ?? body.insightvm_enabled;
    const insightPlatformApiKey = body.insightPlatformApiKey ?? body.insight_platform_api_key;
    const insightPlatformRegion = body.insightPlatformRegion ?? body.insight_platform_region;
    const insightPlatformEnabled = body.insightPlatformEnabled ?? body.insight_platform_enabled;
    const insightcloudsecUrl = body.insightcloudsecUrl ?? body.insightcloudsec_url;
    const insightcloudsecApiKey = body.insightcloudsecApiKey ?? body.insightcloudsec_api_key;
    const insightcloudsecEnabled = body.insightcloudsecEnabled ?? body.insightcloudsec_enabled;
    const autoSyncEnabled = body.autoSyncEnabled ?? body.auto_sync_enabled;
    const autoSyncInterval = body.autoSyncInterval ?? body.auto_sync_interval;

    // Verificar se existe registro anterior para tratar do password mascarado
    const checkRes = await pool.query("SELECT insightvm_password, insightcloudsec_api_key, insight_platform_api_key FROM rapid7_configs WHERE customer_id = $1", [customerId]);

    let finalVmPassword = insightvmPassword;
    let finalCloudSecKey = insightcloudsecApiKey;
    let finalPlatformKey = insightPlatformApiKey;

    if (checkRes.rowCount > 0) {
      const existing = checkRes.rows[0];
      if (insightvmPassword === "●●●●●●●●●●" || !insightvmPassword) {
        finalVmPassword = existing.insightvm_password;
      }
      if (insightcloudsecApiKey === "●●●●●●●●●●" || !insightcloudsecApiKey) {
        finalCloudSecKey = existing.insightcloudsec_api_key;
      }
      if (insightPlatformApiKey === "●●●●●●●●●●" || !insightPlatformApiKey) {
        finalPlatformKey = existing.insight_platform_api_key;
      }
    }

    const r = await pool.query(
      `INSERT INTO rapid7_configs (
        id, customer_id, 
        insightvm_url, insightvm_user, insightvm_password, insightvm_enabled,
        insight_platform_api_key, insight_platform_region, insight_platform_enabled,
        insightcloudsec_url, insightcloudsec_api_key, insightcloudsec_enabled,
        auto_sync_enabled, auto_sync_interval,
        sync_status, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'IDLE', NOW())
       ON CONFLICT (customer_id) 
       DO UPDATE SET
         insightvm_url = EXCLUDED.insightvm_url,
         insightvm_user = EXCLUDED.insightvm_user,
         insightvm_password = EXCLUDED.insightvm_password,
         insightvm_enabled = EXCLUDED.insightvm_enabled,
         insight_platform_api_key = EXCLUDED.insight_platform_api_key,
         insight_platform_region = EXCLUDED.insight_platform_region,
         insight_platform_enabled = EXCLUDED.insight_platform_enabled,
         insightcloudsec_url = EXCLUDED.insightcloudsec_url,
         insightcloudsec_api_key = EXCLUDED.insightcloudsec_api_key,
         insightcloudsec_enabled = EXCLUDED.insightcloudsec_enabled,
         auto_sync_enabled = EXCLUDED.auto_sync_enabled,
         auto_sync_interval = EXCLUDED.auto_sync_interval,
         updated_at = NOW()
       RETURNING *`,
      [
        uuidv4(),
        customerId,
        insightvmUrl ? normalizeStr(insightvmUrl) : null,
        insightvmUser ? normalizeStr(insightvmUser) : null,
        finalVmPassword ? normalizeStr(finalVmPassword) : null,
        parseBool(insightvmEnabled, false),
        finalPlatformKey ? normalizeStr(finalPlatformKey) : null,
        insightPlatformRegion ? normalizeStr(insightPlatformRegion) : "us",
        parseBool(insightPlatformEnabled, false),
        insightcloudsecUrl ? normalizeStr(insightcloudsecUrl) : null,
        finalCloudSecKey ? normalizeStr(finalCloudSecKey) : null,
        parseBool(insightcloudsecEnabled, false),
        parseBool(autoSyncEnabled, false),
        autoSyncInterval !== undefined ? Math.max(1, Number(autoSyncInterval)) : 24
      ]
    );

    return res.status(200).json({ success: true, data: maskConfigPassword(r.rows[0]) });
  } catch (err) {
    console.error("[Update config]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/sync (Trigger Rapid7 Synchronization) ──────────────────
router.post("/sync", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    // Dispara a sincronização de forma assíncrona (background task)
    syncCustomerAssets(customerId).catch(err => {
      console.error(`[Background Sync Error] Customer: ${customerId}`, err);
    });

    return res.status(202).json({ success: true, message: "SYNC_STARTED" });
  } catch (err) {
    console.error("[Sync assets route]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── GET /api/assets/sync-logs (Get Realtime Sync Logs) ──────────────────────
router.get("/sync-logs", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const logs = getLogs(customerId);
    return res.status(200).json({ logs });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/import-excel (Upload and Parse Excel Spreadsheet) ──────
router.post("/import-excel", requireUser(), requirePermission("asset:create"), upload.single("file"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    if (!req.file) {
      return res.status(400).json({ error: "FILE_REQUIRED" });
    }

    // Carregar workbook SheetJS
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: "EXCEL_FILE_EMPTY" });
    }

    let importedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Mapear colunas suportando variações em português / inglês
      const name = row.Hostname || row.Nome || row.Name || row.Host || row.hostname;
      const type = row.Tipo || row.Type || row.Category || "Other";
      const ipAddress = row["IP Address"] || row.IP || row.EnderecoIP || row.ip || row.ip_address;
      const macAddress = row.MAC || row["MAC Address"] || row.mac;
      const os = row["Operating Systems"] || row.SO || row.OS || row["Operating System"] || row.SistemaOperativo || "Unknown OS";
      const riskScore = row.Risco || row.Risk || row.Score || row.risk_score;
      const vulnerabilitiesCount = row.Vulnerabilidades || row.Vulnerabilities || row.vulns || 0;
      const externalId = row["External ID"] || row.external_id || `excel-${Date.now()}-${i}`;
      
      const status = row.Status || row.status || "Online";
      const version = row.Version || row.version || null;
      const connection = row.Connection || row.connection || null;
      const lastSeen = row["Last Seen"] || row.last_seen || null;
      const lastScan = row["Last Scan"] || row.last_scan || row.last_scanned_at || row.last_scanned || null;
      let lastScanVal = null;
      if (lastScan) {
        lastScanVal = new Date(lastScan);
        if (isNaN(lastScanVal.getTime())) {
          lastScanVal = null;
        }
      }

      if (!name) continue; // Pula linhas inválidas sem nome

      const score = riskScore !== undefined ? Math.min(Math.max(Number(riskScore), 0), 1000) : 100;
      const vulnsCount = Number(vulnerabilitiesCount) || 0;

      await pool.query(
        `INSERT INTO assets (id, customer_id, name, type, ip_address, mac_address, os, module, external_id, status, risk_score, vulnerabilities_count, version, connection, last_seen, last_scanned_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Excel Import', $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
         ON CONFLICT (customer_id, module, external_id) 
         DO UPDATE SET 
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           ip_address = EXCLUDED.ip_address,
           mac_address = EXCLUDED.mac_address,
           os = EXCLUDED.os,
           status = EXCLUDED.status,
           risk_score = EXCLUDED.risk_score,
           vulnerabilities_count = EXCLUDED.vulnerabilities_count,
           version = EXCLUDED.version,
           connection = EXCLUDED.connection,
           last_seen = EXCLUDED.last_seen,
           last_scanned_at = EXCLUDED.last_scanned_at,
           updated_at = NOW()`,
        [
          uuidv4(),
          customerId,
          normalizeStr(name),
          normalizeStr(type),
          ipAddress ? normalizeStr(ipAddress) : null,
          macAddress ? normalizeStr(macAddress) : null,
          normalizeStr(os),
          normalizeStr(externalId),
          normalizeStr(status),
          score,
          vulnsCount,
          version ? normalizeStr(version) : null,
          connection ? normalizeStr(connection) : null,
          lastSeen ? normalizeStr(lastSeen) : null,
          lastScanVal || new Date()
        ]
      );

      importedCount++;
    }

    return res.status(200).json({
      success: true,
      importedCount,
      totalRowsProcessed: rows.length
    });

  } catch (err) {
    console.error("[Excel import error]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", detail: err.message });
  }
});

// ─── ENDPOINTS DE SOLICITAÇÃO DE REMOÇÃO DE ASSETS ───────────────────────────

// 1. POST /api/assets/removal-requests (Criar solicitação)
router.post("/removal-requests", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    const { assetId, reason } = req.body;

    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });
    if (!assetId) return res.status(400).json({ error: "ASSET_ID_REQUIRED" });
    if (!reason || !reason.trim()) return res.status(400).json({ error: "REASON_REQUIRED" });

    // Buscar o nome do asset correspondente
    const assetRes = await pool.query(
      "SELECT name FROM assets WHERE id = $1 AND customer_id = $2",
      [assetId, customerId]
    );

    if (assetRes.rowCount === 0) {
      return res.status(404).json({ error: "ASSET_NOT_FOUND" });
    }

    const assetName = assetRes.rows[0].name;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO removal_requests (id, customer_id, asset_id, asset_name, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW())`,
      [id, customerId, assetId, assetName, reason.trim()]
    );

    return res.status(201).json({
      success: true,
      data: { id, customerId, assetId, assetName, reason: reason.trim(), status: "PENDING" }
    });
  } catch (err) {
    console.error("[Create removal request]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 2. GET /api/assets/removal-requests (Listar solicitações do cliente)
router.get("/removal-requests", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "SELECT * FROM removal_requests WHERE customer_id = $1 ORDER BY created_at DESC",
      [customerId]
    );

    return res.status(200).json({ data: r.rows });
  } catch (err) {
    console.error("[List removal requests]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 3. GET /api/assets/removal-requests/admin (Listar todas as solicitações - ADMIN ONLY)
router.get("/removal-requests/admin", requireUser(), async (req, res) => {
  try {
    if (req.auth.type !== "admin") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const r = await pool.query(
      `SELECT r.*, c.name AS customer_name 
       FROM removal_requests r 
       JOIN customers c ON r.customer_id = c.id 
       ORDER BY r.created_at DESC`
    );

    return res.status(200).json({ data: r.rows });
  } catch (err) {
    console.error("[List removal requests admin]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 4. POST /api/assets/removal-requests/:id/action (Aprovar/Rejeitar - ADMIN ONLY)
router.post("/removal-requests/:id/action", requireUser(), async (req, res) => {
  try {
    if (req.auth.type !== "admin") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const { id } = req.params;
    const { action } = req.body; // 'APPROVE' ou 'REJECT'

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return res.status(400).json({ error: "INVALID_ACTION" });
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    // Buscar a solicitação correspondente
    const reqRes = await pool.query(
      "SELECT asset_id, customer_id FROM removal_requests WHERE id = $1",
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    }

    const { asset_id, customer_id } = reqRes.rows[0];

    // Atualizar a solicitação
    await pool.query(
      "UPDATE removal_requests SET status = $1, updated_at = NOW() WHERE id = $2",
      [newStatus, id]
    );

    // Se aprovado, remover o asset da base de dados
    if (action === "APPROVE" && asset_id) {
      await pool.query(
        "DELETE FROM assets WHERE id = $1 AND customer_id = $2",
        [asset_id, customer_id]
      );
    }

    return res.status(200).json({ success: true, status: newStatus });
  } catch (err) {
    console.error("[Action removal request]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Helper para mascarar dados sensíveis retornados na API
function maskConfigPassword(config) {
  if (!config) return null;
  return {
    ...config,
    insightvm_password: config.insightvm_password ? "●●●●●●●●●●" : null,
    insightcloudsec_api_key: config.insightcloudsec_api_key ? "●●●●●●●●●●" : null,
    insight_platform_api_key: config.insight_platform_api_key ? "●●●●●●●●●●" : null,
  };
}

// Helper para mascarar tokens GLPI retornados na API
function maskGlpiConfig(config) {
  if (!config) return null;
  return {
    ...config,
    app_token: config.app_token ? "●●●●●●●●●●" : null,
    user_token: config.user_token ? "●●●●●●●●●●" : null,
  };
}

// ─── GET /api/assets/glpi-config ─────────────────────────────────────────────
router.get("/glpi-config", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.query.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const config = await glpiService.getGlpiConfig(customerId);

    if (!config) {
      const insertRes = await pool.query(
        `INSERT INTO glpi_configs (id, customer_id, enabled, updated_at)
         VALUES ($1, $2, FALSE, NOW())
         RETURNING *`,
        [uuidv4(), customerId]
      );
      return res.status(200).json({ data: maskGlpiConfig(insertRes.rows[0]) });
    }

    return res.status(200).json({ data: maskGlpiConfig(config) });
  } catch (err) {
    console.error("[Get GLPI config]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── PUT /api/assets/glpi-config ─────────────────────────────────────────────
router.put("/glpi-config", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const body = req.body || {};
    const glpiUrl = body.glpiUrl ?? body.glpi_url;
    const appToken = body.appToken ?? body.app_token;
    const userToken = body.userToken ?? body.user_token;
    const enabled = body.enabled;

    // Tratar tokens mascarados: manter valores existentes
    const checkRes = await pool.query(
      "SELECT app_token, user_token FROM glpi_configs WHERE customer_id = $1",
      [customerId]
    );

    let finalAppToken = appToken;
    let finalUserToken = userToken;

    if (checkRes.rowCount > 0) {
      const existing = checkRes.rows[0];
      if (appToken === "●●●●●●●●●●" || !appToken) {
        finalAppToken = existing.app_token;
      }
      if (userToken === "●●●●●●●●●●" || !userToken) {
        finalUserToken = existing.user_token;
      }
    }

    const r = await pool.query(
      `INSERT INTO glpi_configs (id, customer_id, glpi_url, app_token, user_token, enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (customer_id)
       DO UPDATE SET
         glpi_url = EXCLUDED.glpi_url,
         app_token = EXCLUDED.app_token,
         user_token = EXCLUDED.user_token,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        uuidv4(),
        customerId,
        glpiUrl ? glpiService.normalizeGlpiUrl(glpiUrl) : null,
        finalAppToken ? normalizeStr(finalAppToken) : null,
        finalUserToken ? normalizeStr(finalUserToken) : null,
        parseBool(enabled, false)
      ]
    );

    return res.status(200).json({ success: true, data: maskGlpiConfig(r.rows[0]) });
  } catch (err) {
    console.error("[Update GLPI config]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/glpi-config/test ───────────────────────────────────────
router.post("/glpi-config/test", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.auth.type === "admin" ? req.body.customerId : req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const config = await glpiService.getGlpiConfig(customerId);
    if (!config || !config.glpi_url || !config.app_token || !config.user_token) {
      return res.status(409).json({ error: "GLPI_NOT_CONFIGURED" });
    }

    await glpiService.testConnection(config);

    await pool.query(
      "UPDATE glpi_configs SET last_test_at = NOW() WHERE customer_id = $1",
      [customerId]
    );

    return res.status(200).json({ success: true, message: "GLPI_CONNECTION_OK" });
  } catch (err) {
    console.error("[Test GLPI connection]", err);
    return res.status(502).json({ error: "GLPI_CONNECTION_FAILED", detail: err.message });
  }
});

// ─── POST /api/assets/glpi-tickets ──────────────────────────────────────────
router.post("/glpi-tickets", requireUser(), requirePermission("asset:create"), async (req, res) => {
  try {
    const customerId = req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const { actionType, hostName, os, criticality, bu } = req.body || {};
    if (!actionType || !['ADD', 'REMOVE'].includes(actionType)) {
      return res.status(400).json({ error: "INVALID_ACTION_TYPE" });
    }
    if (!hostName || !hostName.trim()) {
      return res.status(400).json({ error: "HOST_NAME_REQUIRED" });
    }
    if (!os || !os.trim()) {
      return res.status(400).json({ error: "OS_REQUIRED" });
    }
    if (!criticality || !['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'].includes(criticality)) {
      return res.status(400).json({ error: "INVALID_CRITICALITY" });
    }
    if (!bu || !['itcorp', 'plural', 'mcd', 'bit'].includes(bu)) {
      return res.status(400).json({ error: "INVALID_BU" });
    }

    // ── Integração real com GLPI: exige credenciais configuradas ──
    const config = await glpiService.getGlpiConfig(customerId);
    if (!glpiService.isConfigured(config)) {
      return res.status(409).json({ error: "GLPI_NOT_CONFIGURED" });
    }

    let glpiResult;
    try {
      glpiResult = await glpiService.createTicket(config, {
        actionType,
        hostName: hostName.trim(),
        os: os.trim(),
        criticality,
        bu
      });
    } catch (glpiErr) {
      console.error("[GLPI API error]", glpiErr);
      return res.status(502).json({ error: "GLPI_API_ERROR", detail: glpiErr.message });
    }

    const ticketId = uuidv4();

    const r = await pool.query(
      `INSERT INTO glpi_tickets (id, customer_id, action_type, host_name, os, criticality, bu, status, ticket_number, glpi_ticket_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, NOW(), NOW())
       RETURNING *`,
      [ticketId, customerId, actionType, hostName.trim(), os.trim(), criticality, bu, glpiResult.ticketNumber, glpiResult.glpiId]
    );

    return res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error("[Create GLPI ticket]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── GET /api/assets/glpi-tickets/template ───────────────────────────────────
router.get("/glpi-tickets/template", requireUser(), (req, res) => {
  try {
    const BOM = "\ufeff";
    const csvContent = BOM + "Ação (ADD/REMOVE);Hostname;Sistema Operativo;Criticidade (LOW/MEDIUM/HIGH/VERY HIGH);Unidade de Negócio (itcorp/plural/mcd/bit)\r\n" +
      "ADD;mc-srv-dns02;Ubuntu Server 22.04 LTS;LOW;itcorp\r\n" +
      "REMOVE;mc-srv-dns01;Windows Server 2019;HIGH;plural\r\n";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=template_batch_hosts.csv");
    return res.send(Buffer.from(csvContent, "utf-8"));
  } catch (err) {
    console.error("[Download GLPI CSV template]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/glpi-tickets/batch ─────────────────────────────────────
router.post("/glpi-tickets/batch", requireUser(), requirePermission("asset:create"), upload.single("file"), async (req, res) => {
  try {
    const customerId = req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const { actionType, criticality, bu } = req.body || {};
    if (!actionType || !['ADD', 'REMOVE'].includes(actionType)) {
      return res.status(400).json({ error: "INVALID_ACTION_TYPE" });
    }
    if (!criticality || !['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'].includes(criticality)) {
      return res.status(400).json({ error: "INVALID_CRITICALITY" });
    }
    if (!bu || !['itcorp', 'plural', 'mcd', 'bit'].includes(bu)) {
      return res.status(400).json({ error: "INVALID_BU" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "FILE_REQUIRED" });
    }

    // ── Integração real com GLPI: exige credenciais configuradas ──
    const config = await glpiService.getGlpiConfig(customerId);
    if (!glpiService.isConfigured(config)) {
      return res.status(409).json({ error: "GLPI_NOT_CONFIGURED" });
    }

    let glpiResult;
    try {
      glpiResult = await glpiService.createTicket(
        config,
        {
          actionType,
          hostName: `Lote: ${req.file.originalname}`,
          os: "Ver CSV em anexo",
          criticality,
          bu
        },
        req.file
      );
    } catch (glpiErr) {
      console.error("[GLPI API error]", glpiErr);
      return res.status(502).json({ error: "GLPI_API_ERROR", detail: glpiErr.message });
    }

    const ticketId = uuidv4();

    const r = await pool.query(
      `INSERT INTO glpi_tickets (id, customer_id, action_type, host_name, os, criticality, bu, status, ticket_number, glpi_ticket_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        ticketId,
        customerId,
        actionType,
        `Lote: ${req.file.originalname}`,
        "Ver CSV em anexo",
        criticality,
        bu,
        glpiResult.ticketNumber,
        glpiResult.glpiId
      ]
    );

    return res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error("[Create GLPI batch ticket]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

async function enrichTicketsWithLastComment(customerId, tickets) {
  try {
    const config = await glpiService.getGlpiConfig(customerId);
    if (!config || !glpiService.isConfigured(config)) {
      return tickets;
    }

    const enriched = await Promise.all(
      tickets.map(async (t) => {
        if (t.glpi_ticket_id) {
          const comment = await glpiService.getLastTicketComment(config, t.glpi_ticket_id);
          if (comment !== null) {
            t.last_comment = comment;
            pool.query(
              "UPDATE glpi_tickets SET last_comment = $1 WHERE id = $2",
              [comment, t.id]
            ).catch(e => console.error("[Cache comment]", e));
          }
        }
        return t;
      })
    );
    return enriched;
  } catch (err) {
    console.error("[Enrich tickets comment]", err);
    return tickets;
  }
}

// ─── GET /api/assets/glpi-tickets ───────────────────────────────────────────
router.get("/glpi-tickets", requireUser(), requirePermission("asset:list"), async (req, res) => {
  try {
    const customerId = req.auth.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "SELECT * FROM glpi_tickets WHERE customer_id = $1 ORDER BY created_at DESC",
      [customerId]
    );

    const enriched = await enrichTicketsWithLastComment(customerId, r.rows);

    return res.status(200).json({ data: enriched });
  } catch (err) {
    console.error("[List GLPI tickets]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── GET /api/assets/glpi-tickets/admin ──────────────────────────────────────
router.get("/glpi-tickets/admin", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const customerId = req.query.customerId;
    if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });

    const r = await pool.query(
      "SELECT * FROM glpi_tickets WHERE customer_id = $1 ORDER BY created_at DESC",
      [customerId]
    );

    const enriched = await enrichTicketsWithLastComment(customerId, r.rows);

    return res.status(200).json({ data: enriched });
  } catch (err) {
    console.error("[List GLPI tickets admin]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── POST /api/assets/glpi-tickets/:id/status ────────────────────────────────
router.post("/glpi-tickets/:id/status", requireUser(), requirePermission("customer:info"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status || !['OPEN', 'PROCESSING', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const r = await pool.query(
      "UPDATE glpi_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "TICKET_NOT_FOUND" });
    }

    return res.status(200).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error("[Update GLPI ticket status]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;

