/**
 * routes/mfa.js — Rotas de MFA (TOTP - Microsoft Authenticator compatível)
 */

const express = require("express");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { pool } = require("../db");
const { verifyToken } = require("../auth");

const router = express.Router();

const APP_NAME = process.env.MFA_APP_NAME || "CWO Inventory Manager";

function getCustomerIdFromReq(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return payload.customerId || payload.sub || null;
  } catch {
    return null;
  }
}

/* ─── GET /api/mfa/status ─────────────────────────────────────────────── */
router.get("/status", async (req, res) => {
  const customerId = getCustomerIdFromReq(req);
  if (!customerId) return res.status(401).json({ error: "UNAUTHORIZED" });

  try {
    const r = await pool.query(
      "SELECT mfa_enabled FROM customers WHERE id = $1",
      [customerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    return res.json({ mfaEnabled: r.rows[0].mfa_enabled });
  } catch {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* ─── POST /api/mfa/setup ─────────────────────────────────────────────── */
router.post("/setup", async (req, res) => {
  const customerId = getCustomerIdFromReq(req);
  if (!customerId) return res.status(401).json({ error: "UNAUTHORIZED" });

  try {
    const r = await pool.query(
      "SELECT id, name, mfa_enabled FROM customers WHERE id = $1",
      [customerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    const customer = r.rows[0];

    if (customer.mfa_enabled) {
      return res.status(409).json({ error: "MFA_ALREADY_ENABLED" });
    }

    // Gerar secret
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${customer.name})`,
      issuer: APP_NAME,
      length: 20,
    });

    // Atualizar secret pendente
    await pool.query(
      "UPDATE customers SET mfa_secret = $1 WHERE id = $2",
      [secret.base32, customerId]
    );

    // Build URL para Microsoft Authenticator
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      label: `${APP_NAME}:${customer.name}`,
      issuer: APP_NAME,
      encoding: "base32",
    });

    // Gerar imagem do QR Code
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    return res.json({
      secret: secret.base32,
      otpauthUrl,
      qrDataUrl,
    });
  } catch (e) {
    console.error("[MFA setup]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* ─── POST /api/mfa/verify ────────────────────────────────────────────── */
router.post("/verify", async (req, res) => {
  const customerId = getCustomerIdFromReq(req);
  if (!customerId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { code } = req.body || {};
  if (!code || String(code).replace(/\s/g, "").length !== 6) {
    return res.status(400).json({ error: "CODE_REQUIRED_6_DIGITS" });
  }

  try {
    const r = await pool.query(
      "SELECT mfa_secret, mfa_enabled FROM customers WHERE id = $1",
      [customerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    const { mfa_secret, mfa_enabled } = r.rows[0];

    if (!mfa_secret) return res.status(400).json({ error: "MFA_SETUP_REQUIRED" });
    if (mfa_enabled) return res.status(409).json({ error: "MFA_ALREADY_ENABLED" });

    const valid = speakeasy.totp.verify({
      secret: mfa_secret,
      encoding: "base32",
      token: String(code).replace(/\s/g, ""),
      window: 1, // tolerância de 30s de delay
    });

    if (!valid) return res.status(401).json({ error: "INVALID_MFA_CODE" });

    await pool.query(
      "UPDATE customers SET mfa_enabled = TRUE WHERE id = $1",
      [customerId]
    );

    return res.json({ mfaEnabled: true });
  } catch (e) {
    console.error("[MFA verify]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* ─── POST /api/mfa/disable ───────────────────────────────────────────── */
router.post("/disable", async (req, res) => {
  const customerId = getCustomerIdFromReq(req);
  if (!customerId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { code } = req.body || {};
  if (!code || String(code).replace(/\s/g, "").length !== 6) {
    return res.status(400).json({ error: "CODE_REQUIRED_6_DIGITS" });
  }

  try {
    const r = await pool.query(
      "SELECT mfa_secret, mfa_enabled FROM customers WHERE id = $1",
      [customerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    const { mfa_secret, mfa_enabled } = r.rows[0];

    if (!mfa_enabled) return res.status(400).json({ error: "MFA_NOT_ENABLED" });

    const valid = speakeasy.totp.verify({
      secret: mfa_secret,
      encoding: "base32",
      token: String(code).replace(/\s/g, ""),
      window: 1,
    });

    if (!valid) return res.status(401).json({ error: "INVALID_MFA_CODE" });

    await pool.query(
      "UPDATE customers SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1",
      [customerId]
    );

    return res.json({ mfaEnabled: false });
  } catch (e) {
    console.error("[MFA disable]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/* ─── POST /api/mfa/validate (durante login) ─────────────────────────── */
router.post("/validate", async (req, res) => {
  const { customerId, code } = req.body || {};
  if (!customerId) return res.status(400).json({ error: "CUSTOMER_ID_REQUIRED" });
  if (!code || String(code).replace(/\s/g, "").length !== 6) {
    return res.status(400).json({ error: "CODE_REQUIRED_6_DIGITS" });
  }

  try {
    const r = await pool.query(
      "SELECT mfa_secret, mfa_enabled FROM customers WHERE id = $1",
      [customerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
    const { mfa_secret, mfa_enabled } = r.rows[0];

    if (!mfa_enabled || !mfa_secret) {
      return res.status(400).json({ error: "MFA_NOT_ENABLED" });
    }

    const valid = speakeasy.totp.verify({
      secret: mfa_secret,
      encoding: "base32",
      token: String(code).replace(/\s/g, ""),
      window: 1,
    });

    if (!valid) return res.status(401).json({ error: "INVALID_MFA_CODE" });

    return res.json({ valid: true });
  } catch (e) {
    console.error("[MFA validate]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
