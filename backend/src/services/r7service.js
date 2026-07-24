/**
 * services/r7service.js — Serviço de Integração com as APIs Rapid7 (e Simulação Mock)
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

// Armazena logs de sincronização temporários em memória para exibição em tempo real na GUI
const syncLogs = {};

function addLog(customerId, message) {
  if (!syncLogs[customerId]) {
    syncLogs[customerId] = [];
  }
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] ${message}`;
  syncLogs[customerId].push(logLine);
  // Mantém apenas os últimos 200 logs
  if (syncLogs[customerId].length > 200) {
    syncLogs[customerId].shift();
  }
  console.log(`[Sync Customer ${customerId}] ${message}`);
}

function getLogs(customerId) {
  return syncLogs[customerId] || [];
}

function clearLogs(customerId) {
  syncLogs[customerId] = [];
}

/**
 * Função principal de sincronização de Assets.
 * @param {string} customerId 
 */
async function syncCustomerAssets(customerId) {
  clearLogs(customerId);
  addLog(customerId, "Iniciando processo de sincronização com Rapid7...");

  // 1. Atualizar status para RUNNING
  await pool.query(
    "UPDATE rapid7_configs SET sync_status = 'RUNNING', error_message = NULL WHERE customer_id = $1",
    [customerId]
  );

  try {
    // Buscar configurações
    const configRes = await pool.query(
      "SELECT * FROM rapid7_configs WHERE customer_id = $1",
      [customerId]
    );

    if (configRes.rowCount === 0) {
      throw new Error("Configurações Rapid7 não encontradas para este tenant.");
    }

    const config = configRes.rows[0];
    const assetsToUpsert = [];

    // Buscar nome do cliente para gerar prefixo de mock dinâmico
    const customerRes = await pool.query(
      "SELECT name FROM customers WHERE id = $1",
      [customerId]
    );
    const customerName = customerRes.rowCount > 0 ? customerRes.rows[0].name : "customer";
    const prefix = customerName.toLowerCase().includes("media") ? "mc" : (customerName.toLowerCase().includes("cwo") ? "cwo" : customerName.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, ""));

    // Determinar campos vazios
    const isInsightVMEmpty = !config.insightvm_url || !config.insightvm_user || !config.insightvm_password;
    const isPlatformEmpty  = !config.insight_platform_api_key;
    const isCloudSecEmpty  = !config.insightcloudsec_url || !config.insightcloudsec_api_key;

    // ─── 1. SINCRONIZAÇÃO INSIGHTVM ───────────────────────────────────────────
    if (config.insightvm_enabled) {
      if (isInsightVMEmpty) {
        throw new Error("InsightVM habilitado mas credenciais/URL não configuradas.");
      }
      const isMockVM = config.insightvm_url.toLowerCase().includes("mock") ||
                        config.insightvm_user.toLowerCase().includes("mock") ||
                        config.insightvm_password.toLowerCase().includes("mock");
      if (isMockVM) {
        addLog(customerId, `[InsightVM] [MOCK] Simulating connection to ${config.insightvm_url}...`);
        const r7VM = [
          {
            name: `${prefix}-srv-vm-win01`,
            type: "Server",
            ip_address: "192.168.10.11",
            mac_address: "00:50:56:AB:CD:01",
            os: "Microsoft Windows Server 2019 Standard",
            module: "InsightVM",
            external_id: "mock-vm-1",
            status: "ACTIVE",
            risk_score: 450,
            vulnerabilities_count: 12,
            last_scanned_at: new Date('2026-07-20T14:30:00Z')
          },
          {
            name: `${prefix}-srv-vm-ubuntu01`,
            type: "Server",
            ip_address: "192.168.10.12",
            mac_address: "00:50:56:AB:CD:02",
            os: "Ubuntu Linux 20.04.4 LTS",
            module: "InsightVM",
            external_id: "mock-vm-2",
            status: "ACTIVE",
            risk_score: 120,
            vulnerabilities_count: 3,
            last_scanned_at: new Date('2026-07-21T09:15:00Z')
          },
          {
            name: `${prefix}-srv-vm-win02`,
            type: "Server",
            ip_address: "192.168.10.13",
            mac_address: "00:50:56:AB:CD:03",
            os: "Microsoft Windows Server 2022 Datacenter",
            module: "InsightVM",
            external_id: "mock-vm-3",
            status: "ACTIVE",
            risk_score: 780,
            vulnerabilities_count: 24,
            last_scanned_at: new Date('2026-07-19T18:45:00Z')
          }
        ];
        assetsToUpsert.push(...r7VM);
        addLog(customerId, `[InsightVM] [MOCK] Imported 3 simulated assets.`);
      } else {
        addLog(customerId, `[InsightVM] A ligar a ${config.insightvm_url}...`);
        try {
          const authHeader = "Basic " + Buffer.from(`${config.insightvm_user}:${config.insightvm_password}`).toString("base64");
          const response = await fetch(`${config.insightvm_url}/api/3/assets?size=100`, {
            headers: { "Authorization": authHeader, "Accept": "application/json" }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
          const data = await response.json();
          const r7VM = (data.resources || []).map(a => {
            const scanEvents = (a.history || []).filter(h => h.type === 'SCAN');
            let lastScanVal = null;
            if (scanEvents.length > 0) {
              scanEvents.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
              lastScanVal = new Date(scanEvents[0].date);
            } else if (a.lastScanDate) {
              lastScanVal = new Date(a.lastScanDate);
            } else if (a.history && a.history.length > 0) {
              a.history.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
              lastScanVal = new Date(a.history[0].date);
            }
            return {
              name: a.hostName || a.ip || `Asset-${a.id}`,
              type: a.type || "Server",
              ip_address: a.ip || null,
              mac_address: a.mac || null,
              os: a.os || a.osFingerprint || "Unknown OS",
              module: "InsightVM",
              external_id: String(a.id),
              status: "ACTIVE",
              risk_score: Math.min(Math.round(a.riskScore || 0), 1000),
              vulnerabilities_count: (a.vulnerabilities?.total || 0),
              last_scanned_at: lastScanVal
            };
          });
          assetsToUpsert.push(...r7VM);
          addLog(customerId, `[InsightVM] Importados ${r7VM.length} assets.`);
        } catch (e) {
          addLog(customerId, `[InsightVM] [ERRO] Falha ao sincronizar: ${e.message}`);
          throw e;
        }
      }
    } else {
      addLog(customerId, "[InsightVM] Módulo desativado.");
    }

    // ─── 2. SINCRONIZAÇÃO INSIGHTCLOUDSEC ─────────────────────────────────────
    if (config.insightcloudsec_enabled) {
      if (isCloudSecEmpty) {
        throw new Error("InsightCloudSec habilitado mas credenciais/URL não configuradas.");
      }
      const isMockCS = config.insightcloudsec_url.toLowerCase().includes("mock") ||
                        config.insightcloudsec_api_key.toLowerCase().includes("mock");
      if (isMockCS) {
        addLog(customerId, `[InsightCloudSec] [MOCK] Simulating connection to ${config.insightcloudsec_url}...`);
        const r7Cloud = [
          {
            name: `${prefix}-cloud-aws-web01`,
            type: "AWS EC2 Instance",
            ip_address: "54.210.43.12",
            mac_address: null,
            os: "Ubuntu Linux 22.04 LTS",
            module: "InsightCloudSec",
            external_id: "mock-cs-1",
            status: "ACTIVE",
            risk_score: 150,
            vulnerabilities_count: 2,
            last_scanned_at: new Date('2026-07-21T22:00:00Z')
          },
          {
            name: `${prefix}-cloud-azure-db01`,
            type: "Azure Virtual Machine",
            ip_address: "10.2.0.4",
            mac_address: null,
            os: "Microsoft Windows Server 2022",
            module: "InsightCloudSec",
            external_id: "mock-cs-2",
            status: "ACTIVE",
            risk_score: 310,
            vulnerabilities_count: 8,
            last_scanned_at: new Date('2026-07-22T02:00:00Z')
          }
        ];
        assetsToUpsert.push(...r7Cloud);
        addLog(customerId, `[InsightCloudSec] [MOCK] Imported 2 simulated cloud resources.`);
      } else {
        addLog(customerId, `[InsightCloudSec] A ligar a ${config.insightcloudsec_url}...`);
        try {
          const response = await fetch(`${config.insightcloudsec_url}/v3/public/query/resources`, {
            method: "POST",
            headers: {
              "Api-Key": config.insightcloudsec_api_key,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              types: ["instance", "storage_container"],
              limit: 50
            })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const r7Cloud = (data.resources || []).map(r => ({
            name: r.name || r.resource_id,
            type: r.resource_type || "Cloud Instance",
            ip_address: r.public_ip || r.private_ip || null,
            mac_address: null,
            os: r.os || "Cloud Managed",
            module: "InsightCloudSec",
            external_id: r.resource_id,
            status: "ACTIVE",
            risk_score: r.badges?.risk_score ? Number(r.badges.risk_score) : 200,
            vulnerabilities_count: r.vulnerabilities_count || 0
          }));
          assetsToUpsert.push(...r7Cloud);
          addLog(customerId, `[InsightCloudSec] Importados ${r7Cloud.length} resources cloud.`);
        } catch (e) {
          addLog(customerId, `[InsightCloudSec] [ERRO] Falha ao sincronizar: ${e.message}`);
          throw e;
        }
      }
    } else {
      addLog(customerId, "[InsightCloudSec] Módulo desativado.");
    }

    // ─── 3. SINCRONIZAÇÃO INSIGHTIDR (Insight Platform) ──────────────────────────
    if (config.insight_platform_enabled) {
      if (isPlatformEmpty) {
        throw new Error("Insight Platform / IDR habilitado mas chave de API não configurada.");
      }
      const isMockIDR = config.insight_platform_api_key.toLowerCase().includes("mock");
      if (isMockIDR) {
        addLog(customerId, `[InsightIDR] [MOCK] Simulating connection to platform API in region '${config.insight_platform_region}'...`);
        const r7IDR = [
          {
            name: `${prefix}-laptop-win11-01`,
            type: "Laptop",
            ip_address: "10.100.20.55",
            mac_address: "A4:83:E7:12:34:56",
            os: "Windows 11 Enterprise",
            module: "InsightVM",
            external_id: "mock-idr-1",
            status: "ONLINE",
            risk_score: 80,
            vulnerabilities_count: 1,
            version: "4.1.1.55",
            connection: "Direct to platform",
            last_seen: new Date().toLocaleString('pt-PT'),
            last_scanned_at: new Date('2026-07-22T08:30:00Z')
          },
          {
            name: `${prefix}-laptop-ubuntu-02`,
            type: "Laptop",
            ip_address: "10.100.20.56",
            mac_address: "A4:83:E7:12:34:57",
            os: "Ubuntu Linux 22.04.1 LTS",
            module: "InsightVM",
            external_id: "mock-idr-2",
            status: "ONLINE",
            risk_score: 50,
            vulnerabilities_count: 0,
            version: "4.1.1.55",
            connection: "Direct to platform",
            last_seen: new Date().toLocaleString('pt-PT'),
            last_scanned_at: new Date('2026-07-22T09:10:00Z')
          }
        ];
        assetsToUpsert.push(...r7IDR);
        addLog(customerId, `[InsightIDR] [MOCK] Imported 2 simulated platform assets.`);
      } else {
        const region = config.insight_platform_region || "us";
        addLog(customerId, `[InsightIDR] A ligar à API Platform na região '${region}' via GraphQL...`);
        try {
          let cursor = null;
          let hasMore = true;
          let totalAssets = [];

          // 1. Obter orgId dinamicamente
          const orgRes = await fetch(`https://${region}.api.insight.rapid7.com/graphql`, {
            method: "POST",
            headers: {
              "X-Api-Key": config.insight_platform_api_key,
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              query: `
                query {
                  organizations(first: 1) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `
            })
          });
          if (!orgRes.ok) throw new Error(`Falha ao obter Organização: HTTP ${orgRes.status}`);
          const orgData = await orgRes.json();
          const orgId = orgData.data?.organizations?.edges?.[0]?.node?.id;
          if (!orgId) throw new Error("ID de Organização não encontrado na API do Rapid7.");

          addLog(customerId, `[InsightIDR] Organização ID encontrada: ${orgId}. Procurando assets...`);

          // 2. Paginação GraphQL
          while (hasMore) {
            const graphqlQuery = {
              query: `
                query($orgId: String!, $cursor: String) {
                  organization(id: $orgId) {
                    assets(first: 500, after: $cursor) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      edges {
                        node {
                          id
                          platform
                          publicIpAddress
                          agent {
                            id
                            agentStatus
                            agentSemanticVersion
                            collector {
                              name
                            }
                            agentLastUpdateTime
                          }
                          host {
                            id
                            hostNames {
                              name
                            }
                            primaryAddress {
                              ip
                              mac
                            }
                            type
                            vendor
                            version
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: { orgId, cursor }
            };

            const response = await fetch(`https://${region}.api.insight.rapid7.com/graphql`, {
              method: "POST",
              headers: {
                "X-Api-Key": config.insight_platform_api_key,
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify(graphqlQuery)
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const resJson = await response.json();
            if (resJson.errors && resJson.errors.length > 0) {
              throw new Error(`Erro GraphQL: ${resJson.errors[0].message}`);
            }

            const connection = resJson.data?.organization?.assets;
            const edges = connection?.edges || [];
            addLog(customerId, `[InsightIDR] Recebidos ${edges.length} assets da página atual.`);

            for (const edge of edges) {
              if (edge.node) {
                totalAssets.push(edge.node);
              }
            }

            const pageInfo = connection?.pageInfo;
            if (pageInfo?.hasNextPage && pageInfo?.endCursor) {
              cursor = pageInfo.endCursor;
            } else {
              hasMore = false;
            }
          }

          const r7IDR = totalAssets.map(node => {
            const agent = node.agent || {};
            const host = node.host || {};
            const hostNames = host.hostNames || [];
            const primaryAddress = host.primaryAddress || {};

            // Preferir nome FQDN com ponto ou o primeiro da lista
            const nameObj = hostNames.find(h => h.name.includes(".")) || hostNames[0];
            const name = nameObj ? nameObj.name : (host.id || node.id);

            const type = host.type || "Endpoint";
            const ip_address = primaryAddress.ip || node.publicIpAddress || null;
            const mac_address = primaryAddress.mac || null;

            const vendor = host.vendor || "";
            const version = host.version || "";
            const os = (vendor || version) ? `${vendor} ${version}`.trim() : (node.platform || "Unknown OS");

            const status = agent.agentStatus || "OFFLINE";
            const versionStr = agent.agentSemanticVersion || null;
            const connectionName = agent.collector?.name || "Direct to platform";

            let lastSeenStr = null;
            if (agent.agentLastUpdateTime) {
              lastSeenStr = new Date(agent.agentLastUpdateTime * 1000).toLocaleString('pt-PT');
            }

            return {
              name: name,
              type: type,
              ip_address: ip_address,
              mac_address: mac_address,
              os: os,
              module: "InsightVM",
              external_id: node.id,
              status: status,
              risk_score: 100,
              vulnerabilities_count: 0,
              version: versionStr,
              connection: connectionName,
              last_seen: lastSeenStr,
              last_scanned_at: agent.agentLastUpdateTime ? new Date(agent.agentLastUpdateTime * 1000) : null
            };
          });

          assetsToUpsert.push(...r7IDR);
          addLog(customerId, `[InsightIDR] Importados ${r7IDR.length} assets.`);
        } catch (e) {
          addLog(customerId, `[InsightIDR] [ERRO] Falha ao sincronizar: ${e.message}`);
          throw e;
        }
      }
    } else {
      addLog(customerId, "[InsightIDR] Módulo desativado.");
    }

    // ─── 4. SALVAR / ATUALIZAR NA BASE DE DADOS ───────────────────────────────
    if (assetsToUpsert.length > 0) {
      addLog(customerId, `Upsating ${assetsToUpsert.length} assets na base de dados...`);
      let upsertCount = 0;

      for (const asset of assetsToUpsert) {
        await pool.query(
          `INSERT INTO assets (id, customer_id, name, type, ip_address, mac_address, os, module, external_id, status, risk_score, vulnerabilities_count, version, connection, last_seen, last_scanned_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
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
            asset.name,
            asset.type,
            asset.ip_address,
            asset.mac_address,
            asset.os,
            asset.module,
            asset.external_id,
            asset.status,
            asset.risk_score,
            asset.vulnerabilities_count,
            asset.version || null,
            asset.connection || null,
            asset.last_seen || null,
            asset.last_scanned_at || new Date()
          ]
        );
        upsertCount++;
      }
      addLog(customerId, `Processadas ${upsertCount} atualizações de assets.`);
    } else {
      addLog(customerId, "Nenhum asset obtido para sincronização.");
    }

    // 5. Finalizar com sucesso
    await pool.query(
      `UPDATE rapid7_configs 
       SET sync_status = 'SUCCESS', last_sync_at = NOW(), error_message = NULL 
       WHERE customer_id = $1`,
      [customerId]
    );
    addLog(customerId, "Sincronização concluída com sucesso!");

  } catch (err) {
    addLog(customerId, `[FATAL] Sincronização falhou: ${err.message}`);
    await pool.query(
      `UPDATE rapid7_configs 
       SET sync_status = 'FAILED', error_message = $1 
       WHERE customer_id = $2`,
      [err.message, customerId]
    );
  }
}





let schedulerIntervalId = null;

function startAutoSyncScheduler() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
  }

  console.log("[Auto-Sync] Iniciando agendador de sincronização automática...");

  // Rodar a verificação a cada 1 minuto
  schedulerIntervalId = setInterval(async () => {
    try {
      // Buscar todas as configurações com auto_sync_enabled = true e que não estejam rodando
      const res = await pool.query(
        `SELECT customer_id, auto_sync_interval, last_sync_at, sync_status, updated_at 
         FROM rapid7_configs 
         WHERE auto_sync_enabled = TRUE AND sync_status != 'RUNNING'`
      );

      for (const row of res.rows) {
        const { customer_id, auto_sync_interval, last_sync_at, updated_at } = row;
        const referenceTime = last_sync_at ? new Date(last_sync_at) : new Date(updated_at);
        const elapsedMs = Date.now() - referenceTime.getTime();
        const intervalMs = auto_sync_interval * 60 * 1000;

        if (elapsedMs >= intervalMs) {
          console.log(`[Auto-Sync] Cliente/Tenant ${customer_id} está pronto para sincronização automática (intervalo: ${auto_sync_interval}m). Executando...`);
          syncCustomerAssets(customer_id).catch(err => {
            console.error(`[Auto-Sync Error] Erro ao sincronizar tenant ${customer_id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error("[Auto-Sync Scheduler Error] Erro na execução do loop do agendador:", err);
    }
  }, 60000); // Executa a cada 60 segundos
}

module.exports = {
  syncCustomerAssets,
  getLogs,
  clearLogs,
  startAutoSyncScheduler
};
