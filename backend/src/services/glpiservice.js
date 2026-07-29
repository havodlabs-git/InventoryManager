/**
 * glpiservice.js — Integração real com a API REST do GLPI
 *
 * Fluxo: initSession → POST /Ticket → killSession
 * Credenciais por tenant armazenadas na tabela glpi_configs.
 */

const { pool } = require("../db");

if (!process.env.DATABASE_URL) {
  console.log("[GLPI_SERVICE] DATABASE_URL não definido. Ativando MOCK GLPI SERVICE.");
  module.exports = {
    getGlpiConfig: async (customerId) => ({
      id: "mock-glpi-config-id",
      customer_id: customerId,
      glpi_url: "http://mock-glpi.local",
      user_token: "mock-token",
      enabled: true
    }),
    isConfigured: () => true,
    testConnection: async () => true,
    createTicket: async (config, { actionType, hostName, os, criticality, bu, comments }, file = null) => {
      const glpiId = Math.floor(Math.random() * 100000) + 1000;
      return {
        glpiId,
        ticketNumber: `GLPI-${glpiId}`
      };
    },
    normalizeGlpiUrl: (url) => url,
    getLastTicketComment: async () => "Mocked GLPI Resolution Comment"
  };
  return;
}

const REQUEST_TIMEOUT_MS = 15000;

// Mapeamento Criticidade → Urgência GLPI (1=Muito Baixa ... 5=Muito Alta)
const URGENCY_MAP = {
  "LOW": 2,
  "MEDIUM": 3,
  "HIGH": 4,
  "VERY HIGH": 5
};

/** Normaliza a URL base do GLPI (remove barra final e sufixo /apirest.php) */
function normalizeGlpiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/apirest\.php$/i, "");
}

/** fetch com timeout */
async function glpiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const { v4: uuidv4 } = require("uuid");

/** Carrega a configuração GLPI do tenant. Inicializa com os dados padrões de produção CWO se não existir ou se estiver vazia. */
async function getGlpiConfig(customerId) {
  const r = await pool.query(
    "SELECT * FROM glpi_configs WHERE customer_id = $1",
    [customerId]
  );
  
  if (r.rowCount === 0) {
    const insertRes = await pool.query(
      `INSERT INTO glpi_configs (id, customer_id, glpi_url, app_token, user_token, enabled, updated_at)
       VALUES ($1, $2, $3, NULL, $4, TRUE, NOW())
       RETURNING *`,
      [
        uuidv4(),
        customerId,
        'https://itsm.cwo.com.pt/',
        '6oyp1BXUORAmPUuBYAsdOhs6672OvxDytFkxMTth'
      ]
    );
    return insertRes.rows[0];
  }
  
  const config = r.rows[0];
  if (!config.glpi_url) {
    const updateRes = await pool.query(
      `UPDATE glpi_configs 
       SET glpi_url = $1, user_token = $2, enabled = TRUE, updated_at = NOW()
       WHERE customer_id = $3
       RETURNING *`,
      ['https://itsm.cwo.com.pt/', '6oyp1BXUORAmPUuBYAsdOhs6672OvxDytFkxMTth', customerId]
    );
    return updateRes.rows[0];
  }
  
  return config;
}

/** Verifica se a configuração tem as credenciais mínimas preenchidas */
function isConfigured(config) {
  return Boolean(
    config &&
    config.enabled &&
    config.glpi_url &&
    config.user_token
  );
}

/** Inicia sessão na API do GLPI e retorna o session_token */
async function initSession(config) {
  const baseUrl = normalizeGlpiUrl(config.glpi_url);
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `user_token ${config.user_token}`
  };
  if (config.app_token) {
    headers["App-Token"] = config.app_token;
  }
  const res = await glpiFetch(`${baseUrl}/apirest.php/initSession`, {
    method: "GET",
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.session_token) {
    const detail = Array.isArray(data) ? data.join(": ") : (data.message || `HTTP ${res.status}`);
    throw new Error(`GLPI_INIT_SESSION_FAILED: ${detail}`);
  }

  return data.session_token;
}

/** Encerra a sessão na API do GLPI (best-effort) */
async function killSession(config, sessionToken) {
  try {
    const baseUrl = normalizeGlpiUrl(config.glpi_url);
    const headers = {
      "Session-Token": sessionToken
    };
    if (config.app_token) {
      headers["App-Token"] = config.app_token;
    }
    await glpiFetch(`${baseUrl}/apirest.php/killSession`, {
      method: "GET",
      headers
    });
  } catch {
    /* best-effort: não falha a operação principal */
  }
}

/**
 * Testa a conexão com o GLPI (initSession + killSession).
 * Lança erro descritivo em caso de falha.
 */
async function testConnection(config) {
  const sessionToken = await initSession(config);
  await killSession(config, sessionToken);
  return true;
}

/**
 * Realiza o upload de um arquivo CSV para a API do GLPI.
 */
async function uploadDocument(config, sessionToken, file) {
  const baseUrl = normalizeGlpiUrl(config.glpi_url);
  const formData = new FormData();

  const uploadManifest = JSON.stringify({
    input: {
      name: file.originalname || "hosts_batch.csv",
      _filename: ["filename[0]"]
    }
  });

  formData.append(
    "uploadManifest",
    new Blob([uploadManifest], { type: "application/json" }),
    "manifest.json"
  );

  formData.append(
    "filename[0]",
    new Blob([file.buffer], { type: file.mimetype || "text/csv" }),
    file.originalname || "hosts_batch.csv"
  );

  const headers = {
    "Session-Token": sessionToken
  };
  if (config.app_token) {
    headers["App-Token"] = config.app_token;
  }

  const res = await glpiFetch(`${baseUrl}/apirest.php/Document`, {
    method: "POST",
    headers,
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const detail = Array.isArray(data) ? data.join(": ") : (data.message || `HTTP ${res.status}`);
    throw new Error(`GLPI_DOCUMENT_UPLOAD_FAILED: ${detail}`);
  }

  return data.id;
}

/**
 * Associa um documento do GLPI a um Ticket.
 */
async function linkDocumentToTicket(config, sessionToken, ticketId, documentId) {
  const baseUrl = normalizeGlpiUrl(config.glpi_url);
  const headers = {
    "Content-Type": "application/json",
    "Session-Token": sessionToken
  };
  if (config.app_token) {
    headers["App-Token"] = config.app_token;
  }

  const res = await glpiFetch(`${baseUrl}/apirest.php/Document_Item`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: {
        items_id: Number(ticketId),
        itemtype: "Ticket",
        documents_id: Number(documentId)
      }
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const detail = Array.isArray(data) ? data.join(": ") : (data.message || `HTTP ${res.status}`);
    throw new Error(`GLPI_LINK_DOCUMENT_FAILED: ${detail}`);
  }

  return data.id;
}

/**
 * Procura o ID da entidade pelo caminho completo ou nome.
 */
async function findEntityIdByPath(config, sessionToken) {
  const baseUrl = normalizeGlpiUrl(config.glpi_url);
  const targetPath = "CWO.GERAL > CWO - DIREÇÃO GERAL > CTS – CONSULTING AND TECHNICAL SERVICES > PURPLETEAM > Gestão de vulnerabilidades";
  const targetName = "Gestão de vulnerabilidades";

  const headers = {
    "Content-Type": "application/json",
    "Session-Token": sessionToken
  };
  if (config.app_token) {
    headers["App-Token"] = config.app_token;
  }

  try {
    const res = await glpiFetch(`${baseUrl}/apirest.php/Entity?range=0-1000`, {
      method: "GET",
      headers
    });

    if (!res.ok) {
      console.warn(`[GLPI Entity Lookup] Failed to fetch entities: HTTP ${res.status}`);
      return null;
    }

    const entities = await res.json().catch(() => []);
    if (!Array.isArray(entities)) {
      return null;
    }

    const normalizePath = (p) => String(p || "").replace(/\s*>\s*/g, ">").trim().toLowerCase();
    const targetNorm = normalizePath(targetPath);

    let match = entities.find(e => normalizePath(e.completename) === targetNorm);
    if (match) {
      console.log(`[GLPI Entity Lookup] Found exact path match: ID ${match.id} (${match.completename})`);
      return match.id;
    }

    match = entities.find(e => String(e.name || "").trim().toLowerCase() === targetName.toLowerCase());
    if (match) {
      console.log(`[GLPI Entity Lookup] Found name match: ID ${match.id} (${match.completename})`);
      return match.id;
    }

    match = entities.find(e => normalizePath(e.completename).includes(targetName.toLowerCase()));
    if (match) {
      console.log(`[GLPI Entity Lookup] Found partial match: ID ${match.id} (${match.completename})`);
      return match.id;
    }

    console.warn(`[GLPI Entity Lookup] Entity "${targetName}" not found in GLPI.`);
    return null;
  } catch (err) {
    console.error("[GLPI Entity Lookup] Error:", err);
    return null;
  }
}

/**
 * Cria um ticket real no GLPI.
 * @returns {{ glpiId: number, ticketNumber: string }}
 */
async function createTicket(config, { actionType, hostName, os, criticality, bu, comments }, file = null) {
  const sessionToken = await initSession(config);

  try {
    const baseUrl = normalizeGlpiUrl(config.glpi_url);
    const actionLabel = actionType === "ADD" ? "Adição" : (actionType === "REMOVE" ? "Remoção" : "Atualização");
    const isBatch = !!file;

    const name = isBatch 
      ? `[IVM] ${actionLabel} em Lote de Ativos`
      : `[IVM] ${actionLabel} de Ativo: ${hostName}`;

    const content = isBatch
      ? [
          `Solicitação de ${actionLabel.toLowerCase()} de ativos em lote no inventário IVM (Rapid7 InsightVM).`,
          ``,
          `- Ação: ${actionType}`,
          `- Criticidade Padrão: ${criticality}`,
          `- Unidade de Negócio Padrão (BU): ${bu}`,
          ``,
          `Por favor, Analista, visualize o arquivo CSV preenchido em anexo.`,
          ``,
          `Ticket aberto automaticamente pelo Inventory Manager.`
        ].join("\n")
      : [
          `Solicitação de ${actionLabel.toLowerCase()} de ativo no inventário IVM (Rapid7 InsightVM).`,
          ``,
          `- Ação: ${actionType}`,
          `- Hostname: ${hostName}`,
          `- Sistema Operativo: ${os}`,
          `- Criticidade: ${criticality}`,
          `- Unidade de Negócio (BU): ${bu}`,
          comments ? `- Comentários/Detalhes: ${comments}` : null,
          ``,
          `Ticket aberto automaticamente pelo Inventory Manager.`
        ].filter(line => line !== null).join("\n");

    const headers = {
      "Content-Type": "application/json",
      "Session-Token": sessionToken
    };
    if (config.app_token) {
      headers["App-Token"] = config.app_token;
    }

    const entityId = await findEntityIdByPath(config, sessionToken);

    const ticketInput = {
      name,
      content,
      urgency: URGENCY_MAP[criticality] || 3,
      type: 2 // 2 = Requisição (Request)
    };

    if (entityId !== null) {
      ticketInput.entities_id = Number(entityId);
    }

    const res = await glpiFetch(`${baseUrl}/apirest.php/Ticket`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: ticketInput
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.id) {
      const detail = Array.isArray(data) ? data.join(": ") : (data.message || `HTTP ${res.status}`);
      throw new Error(`GLPI_CREATE_TICKET_FAILED: ${detail}`);
    }

    const ticketId = data.id;

    if (isBatch) {
      try {
        const documentId = await uploadDocument(config, sessionToken, file);
        await linkDocumentToTicket(config, sessionToken, ticketId, documentId);
      } catch (uploadErr) {
        console.error("[GLPI Upload/Link Error]", uploadErr);
        throw new Error(`GLPI_ATTACHMENT_FAILED: ${uploadErr.message}`);
      }
    }

    return {
      glpiId: ticketId,
      ticketNumber: `GLPI-${ticketId}`
    };
  } finally {
    await killSession(config, sessionToken);
  }
}

/**
 * Obtém o último comentário (ITILFollowup) de um ticket.
 * Retorna null se não houver comentários ou se falhar.
 */
async function getLastTicketComment(config, glpiTicketId) {
  if (!glpiTicketId) return null;
  const sessionToken = await initSession(config).catch(() => null);
  if (!sessionToken) return null;

  try {
    const baseUrl = normalizeGlpiUrl(config.glpi_url);
    const headers = {
      "Content-Type": "application/json",
      "Session-Token": sessionToken
    };
    if (config.app_token) {
      headers["App-Token"] = config.app_token;
    }

    const res = await glpiFetch(`${baseUrl}/apirest.php/Ticket/${glpiTicketId}/ITILFollowup/`, {
      method: "GET",
      headers
    });

    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data) || data.length === 0) {
      return null;
    }

    // Ordena por data decrescente (o mais recente primeiro)
    const sorted = data.sort((a, b) => new Date(b.date_mod || b.date) - new Date(a.date_mod || a.date));
    const lastComment = sorted[0];

    // Remove tags HTML se existirem
    let cleanContent = lastComment.content || "";
    cleanContent = cleanContent.replace(/<\/?[^>]+(>|$)/g, "").trim();

    return cleanContent || null;
  } catch (err) {
    console.error(`[GLPI Get Comment] Erro ao buscar comentários para ticket ${glpiTicketId}:`, err);
    return null;
  } finally {
    await killSession(config, sessionToken);
  }
}

module.exports = {
  getGlpiConfig,
  isConfigured,
  testConnection,
  createTicket,
  normalizeGlpiUrl,
  getLastTicketComment
};
