const { v4: uuidv4 } = require("uuid");
/**
 * db.js — Inicialização da base de dados com suporte RBAC e Multi-Tenancy para o Rapid7 Inventory Manager
 */

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("[WARN] DATABASE_URL não definido. Utilizando banco de dados em memória (MOCK_DB).");
  module.exports = require("./db_mock");
  return;
}

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function waitForDb({ maxAttempts = 30, delayMs = 1000 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr || new Error("DB_NOT_READY");
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ─── Tabela principal de tenants ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id           UUID        PRIMARY KEY,
        name         TEXT        NOT NULL,
        secret_hash  TEXT        NOT NULL,
        mfa_secret   TEXT        NULL,
        mfa_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
        session_token UUID       NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ─── SSO Portal CWO: mapeamento do tenant do Keycloak ─────────────────────
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS keycloak_tenant TEXT NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS customers_keycloak_tenant_idx
        ON customers (keycloak_tenant) WHERE keycloak_tenant IS NOT NULL;
    `);

    // ─── Tabela de utilizadores (GUI only) ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID        PRIMARY KEY,
        customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        email         TEXT        NOT NULL,
        password_hash TEXT        NOT NULL,
        role          TEXT        NOT NULL DEFAULT 'user'
                                  CHECK (role IN ('admin', 'user', 'readonly')),
        session_token UUID        NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT users_customer_email_unique UNIQUE (customer_id, email)
      );
    `);

    // ─── Tabela de API Keys ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id           UUID        PRIMARY KEY,
        customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name         TEXT        NOT NULL,
        prefix       TEXT        NOT NULL,
        key_hash     TEXT        NOT NULL,
        status       TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'revoked')),
        permissions  JSONB       NOT NULL DEFAULT '["asset:list","asset:read","asset:create","asset:update","asset:delete","customer:info"]'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ NULL,
        last_used_at TIMESTAMPTZ NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS api_keys_customer_idx ON api_keys (customer_id);
    `);

    // ─── Tabela de Configurações da API do Rapid7 por Customer ────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS rapid7_configs (
        id                       UUID        PRIMARY KEY,
        customer_id              UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
        insightvm_url            TEXT        NULL,
        insightvm_user           TEXT        NULL,
        insightvm_password       TEXT        NULL,
        insightvm_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
        insight_platform_api_key TEXT        NULL,
        insight_platform_region  TEXT        NULL,
        insight_platform_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
        insightcloudsec_url      TEXT        NULL,
        insightcloudsec_api_key  TEXT        NULL,
        insightcloudsec_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
        sync_status              TEXT        NOT NULL DEFAULT 'IDLE'
                                 CHECK (sync_status IN ('IDLE', 'RUNNING', 'SUCCESS', 'FAILED')),
        last_sync_at             TIMESTAMPTZ NULL,
        error_message            TEXT        NULL,
        auto_sync_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
        auto_sync_interval       INTEGER     NOT NULL DEFAULT 1440,
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Garantir que as colunas novas são adicionadas caso a tabela já existisse
    await client.query(`
      ALTER TABLE rapid7_configs 
      ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await client.query(`
      ALTER TABLE rapid7_configs 
      ADD COLUMN IF NOT EXISTS auto_sync_interval INTEGER NOT NULL DEFAULT 1440;
    `);
    await client.query(`
      ALTER TABLE rapid7_configs ALTER COLUMN auto_sync_interval SET DEFAULT 1440;
    `);
    await client.query(`
      UPDATE rapid7_configs SET auto_sync_interval = auto_sync_interval * 60 WHERE auto_sync_interval <= 24;
    `);

    // ─── Tabela de Assets (Inventário) ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id                    UUID        PRIMARY KEY,
        customer_id           UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name                  TEXT        NOT NULL,
        type                  TEXT        NOT NULL,
        ip_address            TEXT        NULL,
        mac_address           TEXT        NULL,
        os                    TEXT        NULL,
        module                TEXT        NOT NULL, -- 'InsightVM', 'InsightCloudSec', 'InsightIDR', 'Excel Import'
        external_id           TEXT        NOT NULL, -- ID do asset no módulo correspondente
        status                TEXT        NOT NULL DEFAULT 'ACTIVE',
        risk_score            INTEGER     NULL,
        vulnerabilities_count INTEGER     NOT NULL DEFAULT 0,
        last_scanned_at       TIMESTAMPTZ NULL,
        version               TEXT        NULL,
        connection            TEXT        NULL,
        last_seen             TEXT        NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT assets_customer_module_external_unique UNIQUE (customer_id, module, external_id)
      );
    `);

    // Migrações incrementais para a tabela de assets
    await client.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_status_check;
    `);
    await client.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS version TEXT NULL;
    `);
    await client.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS connection TEXT NULL;
    `);
    await client.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_seen TEXT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS assets_customer_idx ON assets (customer_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS assets_module_idx ON assets (module);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS assets_risk_score_idx ON assets (risk_score);
    `);

    // ─── Tabela de Solicitações de Remoção ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS removal_requests (
        id            UUID        PRIMARY KEY,
        customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        asset_id      UUID        REFERENCES assets(id) ON DELETE SET NULL,
        asset_name    TEXT        NOT NULL,
        reason        TEXT        NOT NULL,
        status        TEXT        NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ─── Tabela de Tickets GLPI ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi_tickets (
        id            UUID        PRIMARY KEY,
        customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        action_type   TEXT        NOT NULL CHECK (action_type IN ('ADD', 'REMOVE')),
        host_name     TEXT        NOT NULL,
        os            TEXT        NOT NULL,
        criticality   TEXT        NOT NULL CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'VERY HIGH')),
        bu            TEXT        NOT NULL CHECK (bu IN ('itcorp', 'plural', 'mcd', 'bit')),
        status        TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PROCESSING', 'RESOLVED')),
        ticket_number TEXT        NOT NULL UNIQUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Migração incremental: ID real do ticket no GLPI e último comentário
    await client.query(`
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS glpi_ticket_id INTEGER NULL;
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS last_comment TEXT NULL;
    `);

    // Migração incremental para suportar comentários, edição e automação
    await client.query(`
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS comments TEXT NULL;
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS asset_id UUID NULL REFERENCES assets(id) ON DELETE SET NULL;
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS automate BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE glpi_tickets ADD COLUMN IF NOT EXISTS asset_changes JSONB NULL;
    `);

    // Atualizar check constraint de action_type para suportar 'UPDATE'
    await client.query(`
      ALTER TABLE glpi_tickets DROP CONSTRAINT IF EXISTS glpi_tickets_action_type_check;
      ALTER TABLE glpi_tickets ADD CONSTRAINT glpi_tickets_action_type_check CHECK (action_type IN ('ADD', 'REMOVE', 'UPDATE'));
    `);

    // ─── Tabela de Configurações da API do GLPI por Customer ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS glpi_configs (
        id           UUID        PRIMARY KEY,
        customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
        glpi_url     TEXT        NULL,
        app_token    TEXT        NULL,
        user_token   TEXT        NULL,
        enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
        last_test_at TIMESTAMPTZ NULL,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ─── Seeding de dados padrão (CWO Enterprise) ─────────────────────────────
    const defaultCustomerId = '11111111-1111-1111-1111-111111111111';
    const checkCust = await client.query("SELECT 1 FROM customers WHERE id = $1", [defaultCustomerId]);
    if (checkCust.rowCount === 0) {
      console.log("[DB] Seeding default CWO tenant, user, and config...");
      const bcrypt = require("bcryptjs");
      const { v4: uuidv4 } = require("uuid");
      
      const defaultCustomerSecret = 'cwo-secret';
      const defaultUserPassword = 'cwo-password';
      
      const secretHash = await bcrypt.hash(defaultCustomerSecret, 10);
      const passwordHash = await bcrypt.hash(defaultUserPassword, 10);
      
      // 1. Inserir Customer
      await client.query(
        `INSERT INTO customers (id, name, secret_hash, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [defaultCustomerId, 'CWO Enterprise', secretHash]
      );
      
      // 2. Inserir User GUI
      const defaultUserId = '22222222-2222-2222-2222-222222222222';
      await client.query(
        `INSERT INTO users (id, customer_id, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [defaultUserId, defaultCustomerId, 'admin@cwo.com', passwordHash, 'admin']
      );
      
      // 3. Inserir Configuração Rapid7 padrão
      await client.query(
        `INSERT INTO rapid7_configs (id, customer_id, insightvm_enabled, insight_platform_enabled, insightcloudsec_enabled, sync_status, updated_at)
         VALUES ($1, $2, FALSE, FALSE, FALSE, 'IDLE', NOW())`,
        [uuidv4(), defaultCustomerId]
      );
      
      // 4. Inserir Configuração GLPI padrão
      await client.query(
        `INSERT INTO glpi_configs (id, customer_id, glpi_url, app_token, user_token, enabled, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())`,
        [uuidv4(), defaultCustomerId, 'https://itsm.cwo.com.pt/', null, '6oyp1BXUORAmPUuBYAsdOhs6672OvxDytFkxMTth']
      );
      
      console.log("[DB] Seeding default CWO tenant and user successfully completed.");
    }

    // Garantir que a configuração do GLPI para o cliente padrão está atualizada com as credenciais de produção
    await client.query(
      `INSERT INTO glpi_configs (id, customer_id, glpi_url, app_token, user_token, enabled, updated_at)
       VALUES ($1, $2, $3, NULL, $4, TRUE, NOW())
       ON CONFLICT (customer_id)
       DO UPDATE SET
         glpi_url = EXCLUDED.glpi_url,
         app_token = EXCLUDED.app_token,
         user_token = EXCLUDED.user_token,
         enabled = TRUE,
         updated_at = NOW()
       WHERE glpi_configs.glpi_url IS NULL OR glpi_configs.glpi_url != EXCLUDED.glpi_url OR glpi_configs.user_token != EXCLUDED.user_token`,
      [uuidv4(), defaultCustomerId, 'https://itsm.cwo.com.pt/', '6oyp1BXUORAmPUuBYAsdOhs6672OvxDytFkxMTth']
    );

    await client.query("COMMIT");
    console.log("[DB] Schema de Inventário inicializado com sucesso.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  waitForDb,
  initDb
};
