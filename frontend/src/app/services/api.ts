/**
 * Serviço de integração com o Rapid7 Inventory Backend.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '')
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  adminKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Auth / Customer / Tenant
// ---------------------------------------------------------------------------

export interface TokenResponse {
  token: string;
  tokenType: string;
  expiresIn: string;
  customerId: string;
  customerName: string;
}

export async function getCustomerToken(
  customerId: string,
  customerSecret: string,
): Promise<TokenResponse> {
  return request<TokenResponse>('POST', '/api/customer/token/create', {
    customerId,
    customerSecret,
  });
}

export async function registerCustomer(
  name: string
): Promise<{ customerId: string; customerSecret: string; warning: string }> {
  return request<{ customerId: string; customerSecret: string; warning: string }>('POST', '/api/customer/register', { name });
}

export async function getCustomerMe(
  token: string,
): Promise<{ customerId: string; name: string; createdAt: string; authType: string; permissions: string[] }> {
  return request<{ customerId: string; name: string; createdAt: string; authType: string; permissions: string[] }>(
    'GET',
    '/api/customer/me',
    undefined,
    token,
  );
}

// ---------------------------------------------------------------------------
// Assets Inventory
// ---------------------------------------------------------------------------

export interface AssetRecord {
  id: string;
  customer_id: string;
  name: string;
  type: string;
  ip_address: string | null;
  mac_address: string | null;
  os: string | null;
  module: string; // 'InsightVM' | 'InsightCloudSec' | 'InsightIDR' | 'Excel Import' | 'Manual'
  external_id: string;
  status: string;
  risk_score: number;
  vulnerabilities_count: number;
  last_scanned_at: string | null;
  version?: string | null;
  connection?: string | null;
  last_seen?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListAssetsFilters {
  search?: string;
  type?: string;
  module?: string;
  status?: string;
  riskLevel?: string; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  customerId?: string;
}

export async function listAssets(
  filters: ListAssetsFilters,
  token: string
): Promise<{ customerId: string; total: number; data: AssetRecord[] }> {
  const qs = new URLSearchParams();
  if (filters.search) qs.append('search', filters.search);
  if (filters.type) qs.append('type', filters.type);
  if (filters.module) qs.append('module', filters.module);
  if (filters.status) qs.append('status', filters.status);
  if (filters.riskLevel) qs.append('riskLevel', filters.riskLevel);
  if (filters.customerId) qs.append('customerId', filters.customerId);

  return request<{ customerId: string; total: number; data: AssetRecord[] }>(
    'GET',
    `/api/assets/list?${qs}`,
    undefined,
    token
  );
}

export async function addAssetManual(
  payload: {
    name: string;
    type: string;
    ipAddress?: string;
    macAddress?: string;
    os?: string;
    status?: string;
    version?: string;
    connection?: string;
    lastSeen?: string;
    riskScore?: number;
    vulnerabilitiesCount?: number;
  },
  token: string
): Promise<{ data: AssetRecord }> {
  return request<{ data: AssetRecord }>('POST', '/api/assets/add', payload, token);
}

export async function deleteAsset(
  id: string,
  token: string
): Promise<{ success: boolean; data: AssetRecord }> {
  return request<{ success: boolean; data: AssetRecord }>('DELETE', `/api/assets/${id}`, undefined, token);
}

// ---------------------------------------------------------------------------
// Asset Removal Requests
// ---------------------------------------------------------------------------

export interface RemovalRequestRecord {
  id: string;
  customer_id: string;
  asset_id: string | null;
  asset_name: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  updated_at: string;
  customer_name?: string;
}

export async function createRemovalRequest(
  assetId: string,
  reason: string,
  token: string
): Promise<{ success: boolean; data: RemovalRequestRecord }> {
  return request<{ success: boolean; data: RemovalRequestRecord }>(
    'POST',
    '/api/assets/removal-requests',
    { assetId, reason },
    token
  );
}

export async function listRemovalRequests(
  token: string
): Promise<{ data: RemovalRequestRecord[] }> {
  return request<{ data: RemovalRequestRecord[] }>(
    'GET',
    '/api/assets/removal-requests',
    undefined,
    token
  );
}

export async function adminListRemovalRequests(
  token: string
): Promise<{ data: RemovalRequestRecord[] }> {
  return request<{ data: RemovalRequestRecord[] }>(
    'GET',
    '/api/assets/removal-requests/admin',
    undefined,
    token
  );
}

export async function adminActionRemovalRequest(
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  token: string
): Promise<{ success: boolean; status: string }> {
  return request<{ success: boolean; status: string }>(
    'POST',
    `/api/assets/removal-requests/${requestId}/action`,
    { action },
    token
  );
}


// ---------------------------------------------------------------------------
// Rapid7 API Integrations Config & Sync
// ---------------------------------------------------------------------------

export interface Rapid7Config {
  insightvm_url?: string | null;
  insightvm_user?: string | null;
  insightvm_password?: string | null;
  insightvm_enabled: boolean;
  insight_platform_api_key?: string | null;
  insight_platform_region?: string | null;
  insight_platform_enabled: boolean;
  insightcloudsec_url?: string | null;
  insightcloudsec_api_key?: string | null;
  insightcloudsec_enabled: boolean;
  sync_status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  last_sync_at?: string | null;
  error_message?: string | null;
  auto_sync_enabled: boolean;
  auto_sync_interval: number;
}

export async function getRapid7Config(
  token: string
): Promise<{ data: Rapid7Config }> {
  return request<{ data: Rapid7Config }>('GET', '/api/assets/config', undefined, token);
}

export async function updateRapid7Config(
  config: Partial<Rapid7Config>,
  token: string
): Promise<{ success: boolean; data: Rapid7Config }> {
  return request<{ success: boolean; data: Rapid7Config }>('PUT', '/api/assets/config', config, token);
}

export async function triggerRapid7Sync(
  token: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/api/assets/sync', {}, token);
}

export async function getSyncLogs(
  token: string
): Promise<{ logs: string[] }> {
  return request<{ logs: string[] }>('GET', '/api/assets/sync-logs', undefined, token);
}

// ---------------------------------------------------------------------------
// Excel Import
// ---------------------------------------------------------------------------

export async function importExcelSpreadsheet(
  file: File,
  token: string
): Promise<{ success: boolean; importedCount: number; totalRowsProcessed: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/api/assets/import-excel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

// ---------------------------------------------------------------------------
// MFA (TOTP — Microsoft Authenticator compatible)
// ---------------------------------------------------------------------------

export async function getMfaStatus(
  token: string,
): Promise<{ mfaEnabled: boolean }> {
  return request<{ mfaEnabled: boolean }>('GET', '/api/mfa/status', undefined, token);
}

export async function setupMfa(
  token: string,
): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  return request<{ secret: string; otpauthUrl: string; qrDataUrl: string }>(
    'POST', '/api/mfa/setup', undefined, token,
  );
}

export async function verifyMfa(
  token: string,
  code: string,
): Promise<{ mfaEnabled: boolean }> {
  return request<{ mfaEnabled: boolean }>('POST', '/api/mfa/verify', { code }, token);
}

export async function disableMfa(
  token: string,
  code: string,
): Promise<{ mfaEnabled: boolean }> {
  return request<{ mfaEnabled: boolean }>('POST', '/api/mfa/disable', { code }, token);
}

export async function validateMfaLogin(
  customerId: string,
  code: string,
): Promise<{ valid: boolean }> {
  return request<{ valid: boolean }>('POST', '/api/mfa/validate', { customerId, code });
}

// ---------------------------------------------------------------------------
// Admin Portal APIs (requires X-Admin-Key)
// ---------------------------------------------------------------------------

export interface AdminCustomerInfo {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
  activeApiKeys: number;
  assetCount: number;
}

export async function adminListCustomers(
  adminKey: string,
): Promise<{ total: number; data: AdminCustomerInfo[] }> {
  return request<{ total: number; data: AdminCustomerInfo[] }>(
    'GET', '/api/customer/list', undefined, undefined, adminKey
  );
}

export async function adminDeleteCustomer(
  customerId: string,
  adminKey: string,
): Promise<{ success: boolean; customerId: string; name: string }> {
  return request<{ success: boolean; customerId: string; name: string }>(
    'DELETE', `/api/customer/delete?id=${customerId}`, undefined, undefined, adminKey
  );
}

export async function adminListAssets(
  customerId: string,
  filters: ListAssetsFilters,
  adminKey: string,
): Promise<{ customerId: string; total: number; data: AssetRecord[] }> {
  const qs = new URLSearchParams();
  qs.append('customerId', customerId);
  if (filters.search) qs.append('search', filters.search);
  if (filters.type) qs.append('type', filters.type);
  if (filters.module) qs.append('module', filters.module);
  if (filters.status) qs.append('status', filters.status);

  return request<{ customerId: string; total: number; data: AssetRecord[] }>(
    'GET', `/api/assets/list?${qs}`, undefined, undefined, adminKey
  );
}

export async function adminGetRapid7Config(
  customerId: string,
  adminKey: string,
): Promise<{ data: Rapid7Config }> {
  return request<{ data: Rapid7Config }>(
    'GET', `/api/assets/config?customerId=${customerId}`, undefined, undefined, adminKey
  );
}

export async function adminUpdateRapid7Config(
  customerId: string,
  config: Partial<Rapid7Config>,
  adminKey: string,
): Promise<{ success: boolean; data: Rapid7Config }> {
  return request<{ success: boolean; data: Rapid7Config }>(
    'PUT', '/api/assets/config', { ...config, customerId }, undefined, adminKey
  );
}

export async function adminTriggerRapid7Sync(
  customerId: string,
  adminKey: string,
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    'POST', '/api/assets/sync', { customerId }, undefined, adminKey
  );
}

export async function adminGetSyncLogs(
  customerId: string,
  adminKey: string,
): Promise<{ logs: string[] }> {
  return request<{ logs: string[] }>(
    'GET', `/api/assets/sync-logs?customerId=${customerId}`, undefined, undefined, adminKey
  );
}

export async function adminImportExcel(
  customerId: string,
  file: File,
  adminKey: string,
): Promise<{ success: boolean; importedCount: number; totalRowsProcessed: number }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('customerId', customerId);

  const res = await fetch(`${BASE_URL}/api/assets/import-excel`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export async function adminRotateCustomerSecret(
  customerId: string,
  adminKey: string,
): Promise<{ success: boolean; customerId: string; customerName: string; customerSecret: string; warning: string }> {
  return request<{ success: boolean; customerId: string; customerName: string; customerSecret: string; warning: string }>(
    'POST',
    '/api/customer/secret/rotate',
    { id: customerId },
    undefined,
    adminKey
  );
}

// ---------------------------------------------------------------------------
// GLPI Tickets Integration
// ---------------------------------------------------------------------------

export interface GLPITicketRecord {
  id: string;
  customer_id: string;
  action_type: 'ADD' | 'REMOVE';
  host_name: string;
  os: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
  bu: 'itcorp' | 'plural' | 'mcd' | 'bit';
  status: 'OPEN' | 'PROCESSING' | 'RESOLVED';
  ticket_number: string;
  glpi_ticket_id?: number | null;
  last_comment?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GLPIConfigRecord {
  id: string;
  customer_id: string;
  glpi_url: string | null;
  app_token: string | null;   // mascarado pela API
  user_token: string | null;  // mascarado pela API
  enabled: boolean;
  last_test_at: string | null;
  updated_at: string;
}

export async function getGLPIConfig(
  token: string,
  customerId?: string
): Promise<{ data: GLPIConfigRecord }> {
  const url = customerId ? `/api/assets/glpi-config?customerId=${customerId}` : '/api/assets/glpi-config';
  return request<{ data: GLPIConfigRecord }>(
    'GET',
    url,
    undefined,
    token
  );
}

export async function updateGLPIConfig(
  config: {
    glpiUrl: string;
    appToken: string;
    userToken: string;
    enabled: boolean;
    customerId?: string;
  },
  token: string
): Promise<{ success: boolean; data: GLPIConfigRecord }> {
  return request<{ success: boolean; data: GLPIConfigRecord }>(
    'PUT',
    '/api/assets/glpi-config',
    config,
    token
  );
}

export async function testGLPIConnection(
  token: string,
  customerId?: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    'POST',
    '/api/assets/glpi-config/test',
    { customerId },
    token
  );
}

export async function createGLPITicket(
  ticket: {
    actionType: 'ADD' | 'REMOVE' | 'UPDATE';
    hostName: string;
    os: string;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
    bu: 'itcorp' | 'plural' | 'mcd' | 'bit';
    comments?: string;
    assetId?: string;
    automate?: boolean;
    assetChanges?: any;
  },
  token: string
): Promise<{ success: boolean; data: GLPITicketRecord }> {
  return request<{ success: boolean; data: GLPITicketRecord }>(
    'POST',
    '/api/assets/glpi-tickets',
    ticket,
    token
  );
}

export async function createGLPIBatchTicket(
  ticket: {
    actionType: 'ADD' | 'REMOVE';
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
    bu: 'itcorp' | 'plural' | 'mcd' | 'bit';
    file: File;
  },
  token: string
): Promise<{ success: boolean; data: GLPITicketRecord }> {
  const formData = new FormData();
  formData.append('actionType', ticket.actionType);
  formData.append('criticality', ticket.criticality);
  formData.append('bu', ticket.bu);
  formData.append('file', ticket.file);

  const res = await fetch(`${BASE_URL}/api/assets/glpi-tickets/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}


export async function listGLPITickets(
  token: string
): Promise<{ data: GLPITicketRecord[] }> {
  return request<{ data: GLPITicketRecord[] }>(
    'GET',
    '/api/assets/glpi-tickets',
    undefined,
    token
  );
}

export async function adminListGLPITickets(
  customerId: string,
  adminKey: string
): Promise<{ data: GLPITicketRecord[] }> {
  return request<{ data: GLPITicketRecord[] }>(
    'GET',
    `/api/assets/glpi-tickets/admin?customerId=${customerId}`,
    undefined,
    undefined,
    adminKey
  );
}

export async function adminUpdateGLPITicketStatus(
  ticketId: string,
  status: 'OPEN' | 'PROCESSING' | 'RESOLVED',
  adminKey: string
): Promise<{ success: boolean; data: GLPITicketRecord }> {
  return request<{ success: boolean; data: GLPITicketRecord }>(
    'POST',
    `/api/assets/glpi-tickets/${ticketId}/status`,
    { status },
    undefined,
    adminKey
  );
}
