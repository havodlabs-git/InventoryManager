import { useState, useEffect, useCallback } from 'react';
import { AuthForm } from '@/app/components/AuthForm';
import { Layout } from '@/app/components/Layout';
import { DashboardPage } from '@/app/components/DashboardPage';
import { AssetsPage } from '@/app/components/AssetsPage';
import { AdminPanel } from '@/app/components/AdminPanel';
import RemovalRequestsPage from '@/app/components/RemovalRequestsPage';
import GLPITicketManagementPage from '@/app/components/GLPITicketManagementPage';
import { listAssets, getRapid7Config, triggerRapid7Sync, listGLPITickets, createGLPITicket, createGLPIBatchTicket } from '@/app/services/api';
import type { AssetRecord, AuthData, GLPITicketRecord } from '@/app/services/api';
import type { PageId } from '@/app/components/Layout';
import { DEFAULT_SETTINGS } from '@/app/components/UserSettingsModal';
import type { UserSettings } from '@/app/components/UserSettingsModal';
import { shouldTrySso, trySsoLogin, ssoLogout } from '@/app/services/keycloakSso';
import { toast } from 'sonner';

const SETTINGS_KEY_PREFIX = 'cwo_user_settings_r7';
function settingsKey(customerId?: string) {
  return customerId ? `${SETTINGS_KEY_PREFIX}_${customerId}` : SETTINGS_KEY_PREFIX;
}
const AUTH_KEY = 'cwo_auth_session_r7';
const ADMIN_KEY = 'cwo_admin_session_r7';

// ─── Admin session helper ───
function loadAdminSession(): string | null {
  try {
    return localStorage.getItem(ADMIN_KEY);
  } catch { return null; }
}

function saveAdminSession(key: string | null) {
  try {
    if (key) localStorage.setItem(ADMIN_KEY, key);
    else localStorage.removeItem(ADMIN_KEY);
  } catch { /* ignore */ }
}

async function validateAdminKey(key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/customer/list', {
      headers: { 'x-admin-key': key }
    });
    return res.ok;
  } catch { return false; }
}

// ─── Customer session helpers ───
function loadSettings(customerId?: string): UserSettings {
  try {
    const raw = localStorage.getItem(settingsKey(customerId));
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function loadAuth(): AuthData | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data: AuthData & { exp?: number } = JSON.parse(raw);
    if (data.exp && Date.now() / 1000 > data.exp) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function saveAuth(data: AuthData | null) {
  try {
    if (data) {
      let exp: number | undefined;
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        exp = payload.exp;
      } catch { /* ignore */ }
      localStorage.setItem(AUTH_KEY, JSON.stringify({ ...data, exp }));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  } catch { /* ignore */ }
}

const getAllowedPages = (token?: string): PageId[] => {
  if (!token) return ['dashboard'];
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.scope === 'master') {
      return ['dashboard', 'inventory', 'glpi_tickets', 'removal_requests'];
    }
    const perms = payload.permissions || [];
    const pages: PageId[] = [];
    if (perms.includes('customer:info')) pages.push('dashboard');
    if (perms.includes('asset:list')) pages.push('inventory');
    if (perms.includes('asset:create')) pages.push('glpi_tickets');
    if (perms.includes('asset:delete')) pages.push('removal_requests');
    return pages;
  } catch {
    return ['dashboard'];
  }
};

export default function App() {
  // Admin Mode
  const [adminKey, setAdminKey] = useState<string | null>(loadAdminSession);

  // Deteta se o utilizador está a tentar entrar como admin (?admin=1)
  const isAdminRequest = new URLSearchParams(window.location.search).get('admin') === '1';

  // Customer Mode
  const [auth, setAuth] = useState<AuthData | null>(loadAuth);
  // SSO Portal CWO: desativado por agora (sempre false)
  const [ssoChecking, setSsoChecking] = useState<boolean>(false);
  
  const allowedPages = getAllowedPages(auth?.token);
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  useEffect(() => {
    if (auth && !allowedPages.includes(activePage)) {
      if (allowedPages.length > 0) {
        setActivePage(allowedPages[0]);
      }
    }
  }, [auth, allowedPages, activePage]);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  
  // Filtros de drilldown vindos do Dashboard
  const [drilldownFilters, setDrilldownFilters] = useState<{ type?: string; module?: string; search?: string } | null>(null);

  // Rapid7 Sync configs status (exibido no dashboard)
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() => loadSettings(auth?.customerId));

  // SSO Portal CWO: se o cliente veio do portal com sessão ativa, entra sem senha
  useEffect(() => {
    if (!ssoChecking) return;
    trySsoLogin()
      .then((data) => {
        if (data) {
          saveAuth(data);
          setAuth(data);
          setActivePage('dashboard');
        }
      })
      .finally(() => setSsoChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validar a chave admin persistida na inicialização
  useEffect(() => {
    if (adminKey) {
      validateAdminKey(adminKey).then(valid => {
        if (!valid) {
          saveAdminSession(null);
          setAdminKey(null);
        }
      });
    }
  }, []);

  const fetchAssets = useCallback(async (currentAuth: AuthData) => {
    setLoadingAssets(true);
    try {
      const res = await listAssets({}, currentAuth.token);
      setAssets(res.data ?? []);
      
      // Buscar status de sincronismo mais recente
      const configRes = await getRapid7Config(currentAuth.token);
      setSyncStatus(configRes.data.sync_status);
      setLastSyncAt(configRes.data.last_sync_at || null);
    } catch (err) {
      console.error("Erro ao listar assets no dashboard:", err);
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const [tickets, setTickets] = useState<GLPITicketRecord[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const fetchTickets = useCallback(async (token: string) => {
    setLoadingTickets(true);
    try {
      const res = await listGLPITickets(token);
      setTickets(res.data || []);
    } catch (err) {
      console.error("Erro ao listar tickets GLPI:", err);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    if (auth) {
      fetchAssets(auth);
      fetchTickets(auth.token);
      setSettings(loadSettings(auth.customerId));
    }
  }, [auth, fetchAssets, fetchTickets]);

  // Polling leve para atualizar dashboard se estiver sincronizando
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (auth && syncStatus === 'RUNNING') {
      interval = setInterval(() => {
        fetchAssets(auth);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [auth, syncStatus, fetchAssets]);

  const handleAuthentication = async (data: AuthData) => {
    let isUserAdmin = false;
    if (data.token) {
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        if (payload.role === 'admin' && payload.customerId === '11111111-1111-1111-1111-111111111111') {
          isUserAdmin = true;
        }
      } catch (e) {
        console.error("Erro ao decodificar token:", e);
      }
    }

    const key = data.customerSecret.trim();
    const isSecretAdmin = await validateAdminKey(key);

    if (data.customerId.toLowerCase() === 'admin' || isSecretAdmin || isUserAdmin) {
      if (isSecretAdmin) {
        saveAdminSession(key);
        setAdminKey(key);
      } else if (isUserAdmin && data.token) {
        saveAdminSession(data.token);
        setAdminKey(data.token);
      } else {
        const valid = await validateAdminKey(key);
        if (valid) {
          saveAdminSession(key);
          setAdminKey(key);
        } else {
          throw new Error('INVALID_CUSTOMER_SECRET');
        }
      }
      return;
    }
    saveAuth(data);
    setAuth(data);
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    saveAuth(null);
    setAuth(null);
    setAssets([]);
    setActivePage('dashboard');
  };

  const handleAdminLogout = () => {
    saveAdminSession(null);
    setAdminKey(null);
  };

  const handleRefresh = async () => {
    if (!auth) return;
    try {
      await triggerRapid7Sync(auth.token);
    } catch (e) {
      console.error("Erro ao disparar sync ao atualizar:", e);
    }
    fetchAssets(auth);
  };

  const handleSubmitTicket = async (
    ticketData: {
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
    file?: File | null
  ) => {
    if (!auth) return;
    try {
      let res;
      if (file) {
        res = await createGLPIBatchTicket({
          actionType: ticketData.actionType as 'ADD' | 'REMOVE',
          criticality: ticketData.criticality,
          bu: ticketData.bu,
          file
        }, auth.token);
      } else {
        res = await createGLPITicket(ticketData, auth.token);
      }
      if (res.success) {
        toast.success(`Ticket ${res.data.ticket_number} opened successfully!`);
        fetchTickets(auth.token);
      }
    } catch (err: any) {
      const code = err?.message;
      const friendly =
        code === 'GLPI_NOT_CONFIGURED'
          ? 'Ticketing credentials not configured. Fill in the URL and tokens in the "Ticket Integration (API)" section.'
          : code === 'GLPI_API_ERROR'
          ? 'The system rejected ticket creation. Verify credentials and connectivity.'
          : code === 'GLPI_ATTACHMENT_FAILED'
          ? 'The ticket was opened, but there was an error sending the attached file.'
          : code || 'Error opening ticket.';
      toast.error(friendly);
      throw err;
    }
  };

  const handleUpdateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(settingsKey(auth?.customerId), JSON.stringify(newSettings));
    } catch { /* ignore */ }
  };

  const handleNavigate = (page: PageId) => {
    if (page === 'inventory') {
      // Limpa os filtros se vier do clique do menu lateral direto
      setDrilldownFilters(null);
    }
    setActivePage(page);
  };

  // ── SSO em curso (a entrar via Portal CWO) ──
  if (ssoChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-300 text-sm animate-pulse">A entrar via Portal CWO…</div>
      </div>
    );
  }

  // ── Admin Mode ──
  if (adminKey) {
    return <AdminPanel adminKey={adminKey} onLogout={handleAdminLogout} />;
  }

  // ── Not authenticated ──
  if (!auth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <AuthForm onAuthenticate={handleAuthentication} />
      </div>
    );
  }

  // ── Tenant Portal ──
  return (
    <Layout
      auth={auth}
      onLogout={handleLogout}
      activePage={activePage}
      onNavigate={handleNavigate}
      settings={settings}
      onUpdateSettings={handleUpdateSettings}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          assets={assets}
          tickets={tickets}
          loading={loadingAssets}
          onRefresh={handleRefresh}
          customerName={settings.displayName || auth.customerName}
          syncStatus={syncStatus}
          lastSyncAt={lastSyncAt}
          onDrilldown={(filters) => {
            setDrilldownFilters(filters);
            setActivePage('inventory');
          }}
        />
      )}
      
      {activePage === 'inventory' && (
        <AssetsPage
          assets={assets}
          loading={loadingAssets}
          onRefresh={handleRefresh}
          token={auth.token}
          initialType={drilldownFilters?.type}
          initialModule={drilldownFilters?.module}
          initialSearch={drilldownFilters?.search}
          onClearInitialFilters={() => setDrilldownFilters(null)}
        />
      )}

      {activePage === 'removal_requests' && (
        <RemovalRequestsPage token={auth.token} />
      )}

      {activePage === 'glpi_tickets' && (
        <GLPITicketManagementPage
          tickets={tickets}
          loading={loadingTickets}
          token={auth.token}
          onSubmitTicket={handleSubmitTicket}
        />
      )}
    </Layout>
  );
}
