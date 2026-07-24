/**
 * sso.js — Handoff de sessão Portal CWO (Keycloak) → Inventory Manager
 *
 * POST /api/auth/sso
 *   Header: Authorization: Bearer <access token do Keycloak>
 *
 *   1. Valida o token do Keycloak e exige a role "app-inventory".
 *   2. Mapeia o claim `customerId` (tenant do portal) para o customer local
 *      através da coluna customers.keycloak_tenant.
 *   3. Se o customer ainda não existir e KC_AUTO_PROVISION != "false",
 *      cria-o automaticamente (provisionamento JIT na primeira entrada).
 *   4. Emite o token master LOCAL — exatamente como /api/customer/token/create —
 *      para que todo o resto da app continue a funcionar sem alterações.
 */

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const { pool } = require("../db");
const { keycloakAuth } = require("../keycloak");
const { issueMasterToken, ALL_PERMISSIONS } = require("../auth");

const router = express.Router();

const AUTO_PROVISION = process.env.KC_AUTO_PROVISION !== "false";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

router.post("/sso", keycloakAuth("app-inventory"), async (req, res) => {
  try {
    const { customerId: kcTenant, name, username, email } = req.kc;

    if (!kcTenant) {
      return res.status(400).json({
        error: "KC_TENANT_MISSING",
        message:
          "O token não contém o claim customerId — defina o atributo no utilizador do Keycloak",
      });
    }

    // 1. Procurar o customer local mapeado a este tenant do portal
    let r = await pool.query(
      "SELECT id, name FROM customers WHERE keycloak_tenant = $1 LIMIT 1",
      [kcTenant]
    );

    // 1b. Ligação automática a um customer JÁ EXISTENTE:
    //     se o atributo customerId do Keycloak for o próprio UUID do customer
    //     local (ex.: tenant "Media Capital" criado antes do portal), adota-o
    //     e persiste o mapeamento — sem criar duplicados.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (r.rowCount === 0 && uuidRegex.test(kcTenant)) {
      r = await pool.query(
        `UPDATE customers
            SET keycloak_tenant = $1::text
          WHERE id = $2::uuid
            AND (keycloak_tenant IS NULL OR keycloak_tenant = $1::text)
          RETURNING id, name`,
        [kcTenant, kcTenant]
      );
      if (r.rowCount > 0) {
        console.log(
          `[SSO] Customer existente ligado ao portal: ${r.rows[0].name} (${r.rows[0].id})`
        );
      }
    }

    // 2. Provisionamento JIT (primeira entrada deste tenant)
    if (r.rowCount === 0) {
      if (!AUTO_PROVISION) {
        return res
          .status(404)
          .json({ error: "CUSTOMER_NOT_PROVISIONED", kcTenant });
      }

      const newId = uuidv4();
      const randomSecret = crypto.randomBytes(32).toString("hex");
      const secretHash = await bcrypt.hash(randomSecret, BCRYPT_ROUNDS);
      const displayName = name || username || email || kcTenant;

      r = await pool.query(
        `INSERT INTO customers (id, name, secret_hash, keycloak_tenant)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name`,
        [newId, displayName, secretHash, kcTenant]
      );
      console.log(
        `[SSO] Customer provisionado automaticamente: ${displayName} (${newId}) ← tenant ${kcTenant}`
      );
    }

    const customer = r.rows[0];

    // 3. Rotação de sessão + token master local (mesmo padrão de /token/create)
    const sessionToken = uuidv4();
    await pool.query("UPDATE customers SET session_token = $1 WHERE id = $2", [
      sessionToken,
      customer.id,
    ]);

    const token = issueMasterToken(customer.id, sessionToken);

    return res.status(200).json({
      token,
      tokenType: "Bearer",
      scope: "master",
      permissions: ALL_PERMISSIONS,
      expiresIn: process.env.JWT_EXPIRES_IN || "12h",
      customerId: customer.id,
      customerName: customer.name,
      via: "keycloak-sso",
    });
  } catch (err) {
    console.error("[SSO]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
