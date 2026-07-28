const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const defaultCustomerId = '11111111-1111-1111-1111-111111111111';
const defaultUserId = '22222222-2222-2222-2222-222222222222';

// In-memory data store
const db = {
  customers: [],
  users: [],
  assets: [],
  glpi_configs: [],
  rapid7_configs: [],
  glpi_tickets: [],
  removal_requests: []
};

// Seed initial data
async function seedMockDb() {
  const secretHash = await bcrypt.hash('cwo-secret', 10);
  const passwordHash = await bcrypt.hash('cwo-password', 10);

  db.customers.push({
    id: defaultCustomerId,
    name: 'CWO Enterprise',
    secret_hash: secretHash,
    created_at: new Date()
  });

  db.users.push({
    id: defaultUserId,
    customer_id: defaultCustomerId,
    email: 'admin@cwo.com',
    password_hash: passwordHash,
    role: 'admin',
    created_at: new Date()
  });

  db.rapid7_configs.push({
    id: uuidv4(),
    customer_id: defaultCustomerId,
    insightvm_enabled: false,
    insight_platform_enabled: false,
    insightcloudsec_enabled: false,
    sync_status: 'IDLE',
    updated_at: new Date()
  });

  db.glpi_configs.push({
    id: uuidv4(),
    customer_id: defaultCustomerId,
    glpi_url: 'https://itsm.cwo.com.pt/',
    app_token: null,
    user_token: '6oyp1BXUORAmPUuBYAsdOhs6672OvxDytFkxMTth',
    enabled: true,
    updated_at: new Date()
  });

  // Seed default assets so we can edit them
  db.assets.push(
    {
      id: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
      customer_id: defaultCustomerId,
      name: "cwo-srv-01",
      type: "Server",
      ip_address: "192.168.1.10",
      mac_address: "00:50:56:c0:00:08",
      os: "Ubuntu Server 22.04 LTS",
      module: "InsightVM",
      external_id: "ivm-1",
      status: "Online",
      risk_score: 750,
      vulnerabilities_count: 5,
      last_scanned_at: new Date().toISOString(),
      version: "4.1.1.55",
      connection: "Direct to platform",
      last_seen: "July 1st 2026, 2:57 PM",
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2",
      customer_id: defaultCustomerId,
      name: "cwo-ws-05",
      type: "Workstation",
      ip_address: "192.168.1.15",
      mac_address: "00:50:56:c0:00:09",
      os: "Windows 11 Enterprise",
      module: "InsightVM",
      external_id: "ivm-2",
      status: "Online",
      risk_score: 300,
      vulnerabilities_count: 1,
      last_scanned_at: new Date().toISOString(),
      version: "4.1.1.55",
      connection: "Direct to platform",
      last_seen: "July 2nd 2026, 9:15 AM",
      created_at: new Date(),
      updated_at: new Date()
    }
  );

  console.log("[DB_MOCK] Seed completed successfully.");
}

seedMockDb();

// Fake client & pool to intercept PostgreSQL queries
class MockClient {
  async query(sql, params = []) {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');

    // 1. SELECT 1
    if (cleanSql === 'SELECT 1') {
      return { rows: [{ '1': 1 }], rowCount: 1 };
    }

    // 2. Schema DDL statements
    if (cleanSql.startsWith('CREATE TABLE') || cleanSql.startsWith('ALTER TABLE') || cleanSql.startsWith('CREATE INDEX') || cleanSql.startsWith('DROP CONSTRAINT') || cleanSql === 'BEGIN' || cleanSql === 'COMMIT' || cleanSql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    // 3. SELECT FROM customers WHERE id = $1
    if (cleanSql.includes('FROM customers WHERE id =')) {
      const id = params[0];
      const row = db.customers.find(c => c.id === id);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 5. SELECT * FROM users WHERE customer_id = $1 AND email = $2
    if (cleanSql.includes('FROM users WHERE customer_id =')) {
      const cid = params[0];
      const email = params[1];
      const row = db.users.find(u => u.customer_id === cid && u.email === email);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 6. SELECT * FROM customers WHERE keycloak_tenant = $1
    if (cleanSql.includes('SELECT * FROM customers WHERE keycloak_tenant =')) {
      const tenant = params[0];
      const row = db.customers.find(c => c.keycloak_tenant === tenant);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 7. SELECT * FROM assets WHERE customer_id = $1
    if (cleanSql.includes('SELECT * FROM assets WHERE customer_id =')) {
      const cid = params[0];
      const rows = db.assets.filter(a => a.customer_id === cid);
      return { rows, rowCount: rows.length };
    }

    // 8. SELECT * FROM glpi_tickets WHERE customer_id = $1
    if (cleanSql.includes('SELECT * FROM glpi_tickets WHERE customer_id =')) {
      const cid = params[0];
      const rows = db.glpi_tickets.filter(t => t.customer_id === cid).sort((a, b) => b.created_at - a.created_at);
      return { rows, rowCount: rows.length };
    }

    // 9. SELECT * FROM glpi_configs WHERE customer_id = $1
    if (cleanSql.includes('SELECT * FROM glpi_configs WHERE customer_id =')) {
      const cid = params[0];
      const row = db.glpi_configs.find(c => c.customer_id === cid);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 10. SELECT * FROM rapid7_configs WHERE customer_id = $1
    if (cleanSql.includes('SELECT * FROM rapid7_configs WHERE customer_id =')) {
      const cid = params[0];
      const row = db.rapid7_configs.find(c => c.customer_id === cid);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 11. INSERT INTO customers
    if (cleanSql.startsWith('INSERT INTO customers')) {
      const [id, name, secret_hash, keycloak_tenant] = params;
      const row = { id, name, secret_hash, keycloak_tenant, created_at: new Date() };
      db.customers.push(row);
      return { rows: [row], rowCount: 1 };
    }

    // 12. UPDATE customers SET session_token = $1 WHERE id = $2
    if (cleanSql.includes('UPDATE customers SET session_token =')) {
      const [token, id] = params;
      const row = db.customers.find(c => c.id === id);
      if (row) row.session_token = token;
      return { rows: [row], rowCount: row ? 1 : 0 };
    }

    // 12b. UPDATE users SET session_token = $1 WHERE id = $2
    if (cleanSql.includes('UPDATE users SET session_token =')) {
      const [token, id] = params;
      const row = db.users.find(u => u.id === id);
      if (row) row.session_token = token;
      return { rows: [row], rowCount: row ? 1 : 0 };
    }

    // 12c. SELECT id, customer_id, email, role, session_token FROM users WHERE id = $1
    if (cleanSql.includes('SELECT id, customer_id, email, role, session_token FROM users WHERE id =')) {
      const id = params[0];
      const row = db.users.find(u => u.id === id);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 13. INSERT INTO glpi_tickets
    if (cleanSql.includes('INSERT INTO glpi_tickets')) {
      const [id, customer_id, action_type, host_name, os, criticality, bu, ticket_number, glpi_ticket_id, comments, asset_id, automate, asset_changes] = params;
      const row = {
        id,
        customer_id,
        action_type,
        host_name,
        os,
        criticality,
        bu,
        status: 'OPEN',
        ticket_number,
        glpi_ticket_id,
        comments,
        asset_id,
        automate,
        asset_changes: asset_changes ? JSON.parse(asset_changes) : null,
        created_at: new Date(),
        updated_at: new Date()
      };
      db.glpi_tickets.push(row);
      return { rows: [row], rowCount: 1 };
    }

    // 14. UPDATE glpi_tickets SET status = $1, updated_at = NOW() WHERE id = $2
    if (cleanSql.includes('UPDATE glpi_tickets SET status = $1, updated_at = NOW() WHERE id = $2')) {
      const [status, id] = params;
      const row = db.glpi_tickets.find(t => t.id === id);
      if (row) {
        row.status = status;
        row.updated_at = new Date();
      }
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 15. UPDATE assets SET
    if (cleanSql.includes('UPDATE assets SET')) {
      const assetId = params[params.length - 1];
      const asset = db.assets.find(a => a.id === assetId);
      if (asset) {
        const setClause = cleanSql.split('SET')[1].split('WHERE')[0].trim();
        const assignments = setClause.split(',').map(a => a.trim());
        assignments.forEach((assignment, index) => {
          const colName = assignment.split('=')[0].trim();
          asset[colName] = params[index];
        });
        asset.updated_at = new Date();
      }
      return { rows: asset ? [asset] : [], rowCount: asset ? 1 : 0 };
    }

    // 16. SELECT * FROM glpi_tickets WHERE id = $1
    if (cleanSql.includes('SELECT asset_id, automate, asset_changes FROM glpi_tickets WHERE id =')) {
      const id = params[0];
      const row = db.glpi_tickets.find(t => t.id === id);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // 17. UPDATE glpi_tickets SET last_comment = $1 WHERE id = $2
    if (cleanSql.includes('UPDATE glpi_tickets SET last_comment =')) {
      const [comment, id] = params;
      const row = db.glpi_tickets.find(t => t.id === id);
      if (row) row.last_comment = comment;
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    console.warn("[DB_MOCK] Query não tratada:", cleanSql, params);
    return { rows: [], rowCount: 0 };
  }

  release() {}
}

const mockClient = new MockClient();

class MockPool {
  async query(sql, params = []) {
    return mockClient.query(sql, params);
  }

  async connect() {
    return mockClient;
  }
}

module.exports = {
  pool: new MockPool(),
  waitForDb: async () => {},
  initDb: async () => {}
};
