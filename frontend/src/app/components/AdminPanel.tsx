import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Database,
  Shield,
  Plus,
  Trash2,
  Settings,
  Upload,
  Terminal,
  Clock,
  LogOut,
  RefreshCcw,
  Search,
  Filter,
  Monitor,
  CheckCircle,
  AlertTriangle,
  Play,
  FileSpreadsheet,
  Building2,
  FolderOpen,
  X,
  Server,
  Activity,
  Cloud,
  FileText
} from 'lucide-react';
import {
  adminListCustomers,
  adminDeleteCustomer,
  adminListAssets,
  adminGetRapid7Config,
  adminUpdateRapid7Config,
  adminTriggerRapid7Sync,
  adminGetSyncLogs,
  adminImportExcel,
  registerCustomer,
  adminRotateCustomerSecret,
  adminListRemovalRequests,
  adminActionRemovalRequest,
  adminListGLPITickets,
  adminUpdateGLPITicketStatus,
  adminGetGLPIConfig,
  adminUpdateGLPIConfig,
  adminTestGLPIConnection
} from '@/app/services/api';
import type { AdminCustomerInfo, AssetRecord, Rapid7Config } from '@/app/services/api';
import { Toaster, toast } from 'sonner';

interface AdminPanelProps {
  adminKey: string;
  onLogout: () => void;
}

type TabId = 'assets' | 'integration' | 'import' | 'removal_requests' | 'glpi_tickets';

export function AdminPanel({ adminKey, onLogout }: AdminPanelProps) {
  const [customers, setCustomers] = useState<AdminCustomerInfo[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ id: string; secret: string } | null>(null);

  // Secret Rotation
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotatedCredentials, setRotatedCredentials] = useState<{ id: string; secret: string } | null>(null);

  // Selected Tenant
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabId>('assets');

  // Removal Requests Moderation
  const [removalRequests, setRemovalRequests] = useState<any[]>([]);
  const [loadingRemovals, setLoadingRemovals] = useState(false);

  // GLPI Tickets Moderation
  const [glpiTickets, setGlpiTickets] = useState<any[]>([]);
  const [loadingGLPI, setLoadingGLPI] = useState(false);

  // Tenant Assets
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Tenant Integration Config
  const [vmUrl, setVmUrl] = useState('');
  const [vmUser, setVmUser] = useState('');
  const [vmPassword, setVmPassword] = useState('');
  const [vmEnabled, setVmEnabled] = useState(false);
  const [platformKey, setPlatformKey] = useState('');
  const [platformRegion, setPlatformRegion] = useState('us');
  const [platformEnabled, setPlatformEnabled] = useState(false);
  const [csUrl, setCsUrl] = useState('');
  const [csKey, setCsKey] = useState('');
  const [csEnabled, setCsEnabled] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(1440);

  // GLPI Integration Config
  const [glpiUrl, setGlpiUrl] = useState('');
  const [glpiAppToken, setGlpiAppToken] = useState('');
  const [glpiUserToken, setGlpiUserToken] = useState('');
  const [glpiEnabled, setGlpiEnabled] = useState(false);
  const [testingGLPI, setTestingGLPI] = useState(false);

  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Tenant Import Excel
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // 1. Carregar Tenants
  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await adminListCustomers(adminKey);
      setCustomers(res.data ?? []);
      if (res.data && res.data.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(res.data[0].id);
        setSelectedCustomerName(res.data[0].name);
      }
    } catch {
      toast.error('Error loading customer list.');
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // 2. Carregar Informações do Tenant Selecionado
  const fetchTenantData = async (customerId: string) => {
    if (activeTab === 'assets') {
      setLoadingAssets(true);
      try {
        const res = await adminListAssets(customerId, {}, adminKey);
        setAssets(res.data ?? []);
      } catch {
        toast.error('Error listing customer assets.');
      } finally {
        setLoadingAssets(false);
      }
    } else if (activeTab === 'integration') {
      try {
        const res = await adminGetRapid7Config(customerId, adminKey);
        const c = res.data;
        setVmUrl(c.insightvm_url || '');
        setVmUser(c.insightvm_user || '');
        setVmPassword(c.insightvm_password || '');
        setVmEnabled(c.insightvm_enabled);

        setPlatformKey(c.insight_platform_api_key || '');
        setPlatformRegion(c.insight_platform_region || 'us');
        setPlatformEnabled(c.insight_platform_enabled);

        setCsUrl(c.insightcloudsec_url || '');
        setCsKey(c.insightcloudsec_api_key || '');
        setCsEnabled(c.insightcloudsec_enabled);

        setAutoSyncEnabled(c.auto_sync_enabled ?? false);
        setAutoSyncInterval(c.auto_sync_interval ?? 1440);

        setSyncStatus(c.sync_status);
        setLastSyncAt(c.last_sync_at || null);
        
        if (c.sync_status === 'RUNNING') {
          fetchLogsLoop(customerId);
        } else {
          setSyncLogs([]);
        }

        // Fetch GLPI Config
        try {
          const glpiRes = await adminGetGLPIConfig(customerId, adminKey);
          const gc = glpiRes.data;
          setGlpiUrl(gc.glpi_url || '');
          setGlpiAppToken(gc.app_token || '');
          setGlpiUserToken(gc.user_token || '');
          setGlpiEnabled(gc.enabled);
        } catch (err) {
          console.error('Error loading GLPI config in admin:', err);
        }

      } catch {
        toast.error('Error loading customer configurations.');
      }
    } else if (activeTab === 'removal_requests') {
      setLoadingRemovals(true);
      try {
        const res = await adminListRemovalRequests(adminKey);
        setRemovalRequests((res.data || []).filter((r: any) => r.customer_id === customerId));
      } catch {
        toast.error('Error loading removal requests.');
      } finally {
        setLoadingRemovals(false);
      }
    } else if (activeTab === 'glpi_tickets') {
      setLoadingGLPI(true);
      try {
        const res = await adminListGLPITickets(customerId, adminKey);
        setGlpiTickets(res.data || []);
      } catch {
        toast.error('Error loading GLPI tickets.');
      } finally {
        setLoadingGLPI(false);
      }
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      fetchTenantData(selectedCustomerId);
    }
  }, [selectedCustomerId, activeTab]);

  // Polling de Logs para Sincronização
  const fetchLogsLoop = async (customerId: string) => {
    try {
      const logRes = await adminGetSyncLogs(customerId, adminKey);
      setSyncLogs(logRes.logs);
      
      const configRes = await adminGetRapid7Config(customerId, adminKey);
      setSyncStatus(configRes.data.sync_status);
      setLastSyncAt(configRes.data.last_sync_at || null);

      if (configRes.data.sync_status === 'RUNNING') {
        setTimeout(() => fetchLogsLoop(customerId), 1000);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [syncLogs]);

  // Ações de Tenants
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;

    try {
      const res = await registerCustomer(newTenantName.trim());
      setCreatedCredentials({ id: res.customerId, secret: res.customerSecret });
      toast.success('Customer registered successfully!');
      fetchCustomers();
    } catch {
      toast.error('Error creating customer.');
    }
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete tenant "${name}"? All associated data will be destroyed.`)) return;

    try {
      await adminDeleteCustomer(id, adminKey);
      toast.success('Customer deleted.');
      if (selectedCustomerId === id) {
        setSelectedCustomerId(null);
      }
      fetchCustomers();
    } catch {
      toast.error('Error deleting customer.');
    }
  };

  const handleRemovalRequestAction = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    if (!confirm(`Are you sure you want to ${action === 'APPROVE' ? 'approve and remove the asset' : 'reject'} this removal request?`)) return;
    try {
      await adminActionRemovalRequest(requestId, action, adminKey);
      toast.success(`Request ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully!`);
      if (selectedCustomerId) {
        const res = await adminListRemovalRequests(adminKey);
        setRemovalRequests((res.data || []).filter((r: any) => r.customer_id === selectedCustomerId));
      }
    } catch {
      toast.error('Error moderating request.');
    }
  };

  const handleUpdateGLPITicketStatus = async (ticketId: string, status: 'OPEN' | 'PROCESSING' | 'RESOLVED') => {
    try {
      await adminUpdateGLPITicketStatus(ticketId, status, adminKey);
      toast.success('Ticket status updated successfully!');
      if (selectedCustomerId) {
        const res = await adminListGLPITickets(selectedCustomerId, adminKey);
        setGlpiTickets(res.data || []);
      }
    } catch {
      toast.error('Error updating ticket status.');
    }
  };

  const handleRotateSecret = async () => {
    if (!selectedCustomerId) return;
    setRotatingSecret(true);
    try {
      const res = await adminRotateCustomerSecret(selectedCustomerId, adminKey);
      setRotatedCredentials({ id: res.customerId, secret: res.customerSecret });
      toast.success('Customer Secret rotated successfully!');
      setShowRotateConfirm(false);
    } catch {
      toast.error('Error rotating customer secret.');
    } finally {
      setRotatingSecret(false);
    }
  };

  // Ações de Integração
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    setSavingConfig(true);
    try {
      await adminUpdateRapid7Config(selectedCustomerId, {
        insightvm_url: vmUrl.trim() || null,
        insightvm_user: vmUser.trim() || null,
        insightvm_password: vmPassword,
        insightvm_enabled: vmEnabled,
        insight_platform_api_key: platformKey || null,
        insight_platform_region: platformRegion,
        insight_platform_enabled: platformEnabled,
        insightcloudsec_url: csUrl.trim() || null,
        insightcloudsec_api_key: csKey || null,
        insightcloudsec_enabled: csEnabled,
        auto_sync_enabled: autoSyncEnabled,
        auto_sync_interval: autoSyncInterval
      }, adminKey);

      // Save GLPI Config
      await adminUpdateGLPIConfig(selectedCustomerId, {
        glpiUrl: glpiUrl.trim(),
        appToken: glpiAppToken.trim(),
        userToken: glpiUserToken.trim(),
        enabled: glpiEnabled
      }, adminKey);

      toast.success('Configuration saved successfully!');
      fetchTenantData(selectedCustomerId);
    } catch {
      toast.error('Error saving configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleStartSync = async () => {
    if (!selectedCustomerId) return;
    setSyncing(true);
    setSyncLogs([]);
    try {
      await adminTriggerRapid7Sync(selectedCustomerId, adminKey);
      setSyncStatus('RUNNING');
      toast.info('Sync started.');
      setTimeout(() => fetchLogsLoop(selectedCustomerId), 1000);
    } catch {
      toast.error('Error triggering sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handleTestGLPIConnection = async () => {
    if (!selectedCustomerId) return;
    setTestingGLPI(true);
    try {
      await adminTestGLPIConnection(selectedCustomerId, adminKey);
      toast.success('Connection to ticketing system established successfully!');
    } catch (err: any) {
      const msg = err?.message === 'GLPI_NOT_CONFIGURED'
        ? 'Save credentials before testing the connection.'
        : 'Connection failed. Check URL and tokens.';
      toast.error(msg);
    } finally {
      setTestingGLPI(false);
    }
  };

  // Ações de Excel Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        setSelectedFile(file);
      } else {
        toast.error('File type not supported. Upload .xlsx or .csv');
      }
    }
  };

  const handleUploadExcel = async () => {
    if (!selectedCustomerId || !selectedFile) return;
    setImporting(true);
    try {
      const res = await adminImportExcel(selectedCustomerId, selectedFile, adminKey);
      toast.success(`Imported successfully! ${res.importedCount} assets processed.`);
      setSelectedFile(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error importing spreadsheet.');
    } finally {
      setImporting(false);
    }
  };

  // Processamento local de filtros da tabela
  const uniqueTypes = useMemo(() => {
    const types = new Set(assets.map(a => a.type).filter(Boolean));
    return Array.from(types).sort();
  }, [assets]);

  const uniqueModules = useMemo(() => {
    const modules = new Set(assets.map(a => a.module).filter(Boolean));
    return Array.from(modules).sort();
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = !search || 
        asset.name.toLowerCase().includes(search.toLowerCase()) ||
        (asset.ip_address && asset.ip_address.includes(search)) ||
        (asset.os && asset.os.toLowerCase().includes(search.toLowerCase()));

      const matchesModule = !selectedModule || asset.module === selectedModule;
      const matchesType = !selectedType || asset.type === selectedType;

      return matchesSearch && matchesModule && matchesType;
    });
  }, [assets, search, selectedModule, selectedType]);

  return (
    <div className="flex h-screen bg-[#070b13] text-slate-100 overflow-hidden font-sans">
      <Toaster position="top-right" richColors />

      {/* ─── SIDEBAR: Lista de Tenants ─── */}
      <aside className="w-80 bg-[#0d1321] border-r border-white/[0.08] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-sm text-white uppercase tracking-wider">CWO Admin Portal</span>
          </div>
          <button 
            onClick={onLogout} 
            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            title="Logout Administrator"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Criar Tenant */}
        <div className="p-4 border-b border-white/[0.05]">
          <button
            onClick={() => { setShowCreateModal(true); setCreatedCredentials(null); setNewTenantName(''); }}
            className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Tenant</span>
          </button>
        </div>

        {/* Lista de Clientes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">Empresas / Tenants</p>
          {loadingCustomers ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-2">
              <RefreshCcw className="w-5 h-5 text-slate-500 animate-spin" />
              <span className="text-xs text-slate-500">Loading Tenants...</span>
            </div>
          ) : customers.length > 0 ? (
            customers.map((c) => {
              const active = selectedCustomerId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => { setSelectedCustomerId(c.id); setSelectedCustomerName(c.name); }}
                  className={`group w-full flex items-center justify-between px-3 py-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                    active
                      ? 'bg-blue-600/10 text-blue-400 border-blue-500'
                      : 'bg-white/[0.01] border-white/[0.04] text-slate-300 hover:bg-white/[0.03] hover:text-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      <p className="text-xs font-bold truncate text-white">{c.name}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Assets: {c.assetCount}</span>
                      <span>•</span>
                      <span>Users: {c.userCount}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTenant(c.id, c.name); }}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/15 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    title="Excluir Tenant"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center text-xs text-slate-600">No customers registered.</div>
          )}
        </div>
      </aside>

      {/* ─── PAINEL CENTRAL / DETALHES DO TENANT ─── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedCustomerId ? (
          <>
            {/* Header com Info do Tenant */}
            <header className="bg-[#0b101c] border-b border-white/[0.08] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">{selectedCustomerName}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1">
                  <p className="text-[10px] text-slate-500 font-mono">ID: {selectedCustomerId}</p>
                  <button
                    onClick={() => {
                      setRotatedCredentials(null);
                      setShowRotateConfirm(true);
                    }}
                    className="px-2 py-0.5 text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 rounded font-semibold transition-all flex items-center gap-1 cursor-pointer animate-fade-in"
                    title="Generate new Customer Secret and expire active sessions"
                  >
                    <span>Rotate Secret</span>
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex bg-[#070b13] p-1 border border-white/[0.06] rounded-xl text-xs">
                <button
                  onClick={() => setActiveTab('assets')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    activeTab === 'assets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>View Assets</span>
                </button>
                <button
                  onClick={() => setActiveTab('integration')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    activeTab === 'integration' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure API</span>
                </button>
                <button
                  onClick={() => setActiveTab('import')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    activeTab === 'import' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Excel</span>
                </button>
                <button
                  onClick={() => setActiveTab('removal_requests')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    activeTab === 'removal_requests' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Requests</span>
                </button>
                <button
                  onClick={() => setActiveTab('glpi_tickets')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    activeTab === 'glpi_tickets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>GLPI Tickets</span>
                </button>
              </div>
            </header>

            {/* Conteúdo Dinâmico com base na Tab Ativa */}
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-[#070b13] to-[#04060b]">
              
              {/* ── Tab 1: Inventário ── */}
              {activeTab === 'assets' && (
                <div className="space-y-4">
                  {/* Filtros */}
                  <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                      <div className="relative min-w-[200px] w-full sm:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search tenant assets..."
                          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <select
                        value={selectedModule}
                        onChange={(e) => setSelectedModule(e.target.value)}
                        className="bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none"
                      >
                        <option value="">All Sources</option>
                        {uniqueModules.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>

                      <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none"
                      >
                        <option value="">All Types</option>
                        {uniqueTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <button 
                      onClick={() => fetchTenantData(selectedCustomerId)}
                      className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
                      title="Reload"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Grid */}
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
                    {loadingAssets ? (
                      <div className="py-20 flex flex-col items-center gap-3">
                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                        <p className="text-xs text-slate-500">Loading tenant inventory...</p>
                      </div>
                    ) : filteredAssets.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.01] text-slate-500 font-semibold uppercase tracking-wider">
                              <th className="px-4 py-3">Name</th>
                              <th className="px-4 py-3">Source</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">IP Address</th>
                              <th className="px-4 py-3">MAC Address</th>
                              <th className="px-4 py-3">OS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAssets.map((asset) => (
                              <tr key={asset.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors text-slate-300">
                                <td className="px-4 py-3 font-semibold text-white truncate max-w-[150px]">{asset.name}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                    asset.module === 'InsightVM' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' :
                                    asset.module === 'InsightCloudSec' ? 'bg-cyan-600/10 text-cyan-400 border-cyan-500/20' :
                                    asset.module === 'InsightIDR' ? 'bg-purple-600/10 text-purple-400 border-purple-500/20' :
                                    'bg-emerald-600/10 text-emerald-400 border-emerald-500/20'
                                  }`}>
                                    {asset.module}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400 font-medium">{asset.type}</td>
                                <td className="px-4 py-3 font-mono">{asset.ip_address || 'N/A'}</td>
                                <td className="px-4 py-3 font-mono text-slate-500">{asset.mac_address || 'N/A'}</td>
                                <td className="px-4 py-3 truncate max-w-[150px]">{asset.os || 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                        <FolderOpen className="w-10 h-10 text-white/[0.05]" />
                        <p className="text-xs">No assets found for this Tenant.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 2: Integração Rapid7 ── */}
              {activeTab === 'integration' && (
                <div className="space-y-6 max-w-4xl mx-auto">
                  <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* InsightVM */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Server className="w-5 h-5 text-blue-400" />
                          <h3 className="text-sm font-bold text-white">InsightVM (Console API)</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vmEnabled}
                            onChange={(e) => setVmEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-400">InsightVM API Endpoint</label>
                          <input
                            type="text"
                            disabled={!vmEnabled}
                            value={vmUrl}
                            onChange={(e) => setVmUrl(e.target.value)}
                            placeholder="https://us.api.insight.rapid7.com/vm"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-slate-400">Console User</label>
                            <input
                              type="text"
                              disabled={!vmEnabled}
                              value={vmUser}
                              onChange={(e) => setVmUser(e.target.value)}
                              placeholder="admin"
                              className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-400">Password / API Token</label>
                            <input
                              type="password"
                              disabled={!vmEnabled}
                              value={vmPassword}
                              onChange={(e) => setVmPassword(e.target.value)}
                              placeholder="••••••••••••"
                              className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* InsightIDR */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-purple-400" />
                          <h3 className="text-sm font-bold text-white">Insight Platform (InsightIDR)</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={platformEnabled}
                            onChange={(e) => setPlatformEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-400">Platform API Key (X-Api-Key)</label>
                          <input
                            type="password"
                            disabled={!platformEnabled}
                            value={platformKey}
                            onChange={(e) => setPlatformKey(e.target.value)}
                            placeholder="Enter platform key"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400">Account Region</label>
                          <select
                            disabled={!platformEnabled}
                            value={platformRegion}
                            onChange={(e) => setPlatformRegion(e.target.value)}
                            className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2"
                          >
                            <option value="us">United States (US)</option>
                            <option value="eu">Europe (EU)</option>
                            <option value="ca">Canada (CA)</option>
                            <option value="au">Australia (AU)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* InsightCloudSec */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-5 h-5 text-cyan-400" />
                          <h3 className="text-sm font-bold text-white">InsightCloudSec</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={csEnabled}
                            onChange={(e) => setCsEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-400">Endpoint API Url</label>
                          <input
                            type="text"
                            disabled={!csEnabled}
                            value={csUrl}
                            onChange={(e) => setCsUrl(e.target.value)}
                            placeholder="https://insightcloudsec.cwo.com"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400">API Key</label>
                          <input
                            type="password"
                            disabled={!csEnabled}
                            value={csKey}
                            onChange={(e) => setCsKey(e.target.value)}
                            placeholder="Enter CloudSec API Key"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Integração de Tickets (GLPI) */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-blue-400" />
                          <h3 className="text-sm font-bold text-white">Ticket Integration (GLPI)</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={glpiEnabled}
                            onChange={(e) => setGlpiEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-400">GLPI Server URL</label>
                          <input
                            type="text"
                            disabled={!glpiEnabled}
                            value={glpiUrl}
                            onChange={(e) => setGlpiUrl(e.target.value)}
                            placeholder="https://glpi.mediacapital.pt"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400">App Token</label>
                          <input
                            type="password"
                            disabled={!glpiEnabled}
                            value={glpiAppToken}
                            onChange={(e) => setGlpiAppToken(e.target.value)}
                            placeholder="●●●●●●●●●●"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400">User Token</label>
                          <input
                            type="password"
                            disabled={!glpiEnabled}
                            value={glpiUserToken}
                            onChange={(e) => setGlpiUserToken(e.target.value)}
                            placeholder="●●●●●●●●●●"
                            className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white"
                          />
                        </div>

                        {glpiEnabled && (
                          <button
                            type="button"
                            onClick={handleTestGLPIConnection}
                            disabled={testingGLPI || !glpiUrl}
                            className="w-full mt-2 py-2 rounded bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/30 text-blue-400 text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {testingGLPI ? 'Testing connection...' : 'Test Ticketing Connection'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sincronização Automática (Agendada) */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">Automatic Sync (Scheduled)</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoSyncEnabled}
                            onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-400 font-medium">Sync Interval</label>
                          <select
                            disabled={!autoSyncEnabled}
                            value={autoSyncInterval}
                            onChange={(e) => setAutoSyncInterval(Number(e.target.value))}
                            className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2"
                          >
                            <option value={5}>Every 5 minutes</option>
                            <option value={15}>Every 15 minutes</option>
                            <option value={30}>Every 30 minutes</option>
                            <option value={60}>Every 1 hour</option>
                            <option value={360}>Every 6 hours</option>
                            <option value={720}>Every 12 hours</option>
                            <option value={1440}>Every 24 hours (Daily)</option>
                          </select>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          When enabled, the server will automatically sync assets at the defined interval. Sync status will be displayed on the client dashboard.
                        </p>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-white mb-2">Administrator Actions Panel</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Save credentials before forcing sync. Leave credentials containing "mock" to run the local simulation.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button
                          type="submit"
                          disabled={savingConfig}
                          className="w-full py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleStartSync}
                          disabled={syncing || syncStatus === 'RUNNING' || (!vmEnabled && !platformEnabled && !csEnabled)}
                          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10"
                        >
                          <Play className="w-4 h-4" />
                          <span>{syncStatus === 'RUNNING' ? 'Syncing...' : 'Sync Now'}</span>
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Terminal de logs */}
                  <div className="bg-[#04060c] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-slate-900/50 border-b border-white/[0.08] px-4 py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-400 font-mono">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        <span>Client Sync Logs</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className={`w-2 h-2 rounded-full ${
                          syncStatus === 'RUNNING' ? 'bg-blue-500 animate-pulse' :
                          syncStatus === 'SUCCESS' ? 'bg-emerald-500' :
                          syncStatus === 'FAILED' ? 'bg-red-500' : 'bg-slate-600'
                        }`} />
                        <span>{syncStatus}</span>
                      </div>
                    </div>
                    <div className="h-48 p-4 font-mono text-[10px] text-emerald-400 overflow-y-auto space-y-1 bg-black/40">
                      {syncLogs.length > 0 ? (
                        syncLogs.map((log, idx) => <div key={idx}>{log}</div>)
                      ) : (
                        <div className="text-slate-600 text-center py-16">
                          No recent sync logs.
                        </div>
                      )}
                      <div ref={terminalEndRef} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 3: Importar Planilha ── */}
              {activeTab === 'import' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-white/[0.02] border border-white/[0.08] p-6 rounded-2xl space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide">Upload Excel/CSV spreadsheet</h3>
                      <p className="text-xs text-slate-500 mt-1">Upload assets to this customer's inventory in bulk.</p>
                    </div>

                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                        dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-white/[0.08] bg-black/10 hover:border-white/[0.15]'
                      }`}
                    >
                      <FileSpreadsheet className={`w-10 h-10 ${selectedFile ? 'text-emerald-400' : 'text-slate-600'}`} />
                      
                      {selectedFile ? (
                        <div className="text-center">
                          <p className="text-xs font-bold text-white">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-xs text-slate-300 font-medium">Drag spreadsheet or click the button below</p>
                          <p className="text-[10px] text-slate-500 mt-1">Supports .xlsx, .xls or .csv files</p>
                        </div>
                      )}

                      <label className="relative mt-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                        <span>Select File</span>
                        <input type="file" onChange={handleFileChange} className="hidden" accept=".xlsx,.xls,.csv" />
                      </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                      {selectedFile && (
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-xs font-semibold text-slate-300 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        onClick={handleUploadExcel}
                        disabled={!selectedFile || importing}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-600/10 flex items-center justify-center gap-1.5 transition-all"
                      >
                        {importing ? (
                          <>
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                            <span>Importing file...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            <span>Import Spreadsheet</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 4: Solicitações de Remoção (Moderação) ── */}
              {activeTab === 'removal_requests' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Pending Removal Requests</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Analyze and decide on asset deletion requests for this tenant.</p>
                    </div>
                    <button 
                      onClick={() => selectedCustomerId && fetchTenantData(selectedCustomerId)}
                      className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
                      title="Reload"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden text-xs">
                    {loadingRemovals ? (
                      <div className="py-20 flex flex-col items-center gap-3">
                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                        <p className="text-slate-500">Loading requests...</p>
                      </div>
                    ) : removalRequests.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.01] text-slate-500 font-semibold uppercase tracking-wider">
                              <th className="px-4 py-3">Hostname / Asset</th>
                              <th className="px-4 py-3">Removal Reason</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3 text-center">Moderation Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {removalRequests.map((req) => {
                              const dateStr = new Date(req.created_at).toLocaleString('pt-PT', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                              return (
                                <tr key={req.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors text-slate-300">
                                  <td className="px-4 py-4 font-semibold text-white truncate max-w-[150px]">{req.asset_name}</td>
                                  <td className="px-4 py-4 max-w-xs truncate text-slate-400" title={req.reason}>{req.reason}</td>
                                  <td className="px-4 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                      req.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                      req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                      'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                      {req.status === 'PENDING' ? 'Pending' :
                                       req.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 text-slate-500">{dateStr}</td>
                                  <td className="px-4 py-4 text-center">
                                    {req.status === 'PENDING' ? (
                                      <div className="flex justify-center gap-2">
                                        <button
                                          onClick={() => handleRemovalRequestAction(req.id, 'APPROVE')}
                                          className="px-2.5 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow transition-all cursor-pointer"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleRemovalRequestAction(req.id, 'REJECT')}
                                          className="px-2.5 py-1 text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow transition-all cursor-pointer"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 italic">Moderated</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                        <FolderOpen className="w-10 h-10 text-white/[0.05]" />
                        <p className="text-xs">No pending removal requests for this tenant.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 5: Moderador de Tickets GLPI ── */}
              {activeTab === 'glpi_tickets' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Customer GLPI Tickets</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Manage and validate the tenant asset addition and removal requests.</p>
                    </div>
                    <button 
                      onClick={() => selectedCustomerId && fetchTenantData(selectedCustomerId)}
                      className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
                      title="Reload"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden text-xs">
                    {loadingGLPI ? (
                      <div className="py-20 flex flex-col items-center gap-3">
                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                        <p className="text-slate-500">Loading tickets...</p>
                      </div>
                    ) : glpiTickets.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-white/[0.01] text-slate-500 font-semibold uppercase tracking-wider">
                              <th className="px-4 py-3">Ticket No.</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Hostname</th>
                              <th className="px-4 py-3 font-mono">Criticality</th>
                              <th className="px-4 py-3">BU</th>
                              <th className="px-4 py-3">Last Comment (GLPI)</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {glpiTickets.map((t) => {
                              return (
                                <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors text-slate-300">
                                  <td className="px-4 py-4 font-bold font-mono text-white select-all">{t.ticket_number}</td>
                                  <td className="px-4 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                      t.action_type === 'ADD'
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                    }`}>
                                      {t.action_type === 'ADD' ? 'Add' : 'Remove'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-semibold text-white">{t.host_name}</div>
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{t.os}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${
                                      t.criticality === 'VERY HIGH'
                                        ? 'bg-red-600/10 text-red-500 border-red-500/30'
                                        : t.criticality === 'HIGH'
                                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                        : t.criticality === 'MEDIUM'
                                        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                                    }`}>
                                      {t.criticality}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 uppercase font-semibold text-slate-400">{t.bu}</td>
                                  <td className="px-4 py-4 max-w-[200px] truncate text-slate-400" title={t.last_comment || 'No comments'}>
                                    {t.last_comment || <span className="text-slate-600 italic">No comments</span>}
                                  </td>
                                  <td className="px-4 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                                      t.status === 'OPEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                      t.status === 'PROCESSING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    }`}>
                                      {t.status === 'OPEN' ? 'Open' :
                                       t.status === 'PROCESSING' ? 'Processing' : 'Resolved'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    <div className="flex justify-center gap-1.5">
                                      {t.status !== 'PROCESSING' && t.status !== 'RESOLVED' && (
                                        <button
                                          onClick={() => handleUpdateGLPITicketStatus(t.id, 'PROCESSING')}
                                          className="px-2 py-1 text-[9px] bg-amber-600 hover:bg-amber-500 text-white font-bold rounded shadow transition-all cursor-pointer"
                                        >
                                          Process
                                        </button>
                                      )}
                                      {t.status !== 'RESOLVED' && (
                                        <button
                                          onClick={() => handleUpdateGLPITicketStatus(t.id, 'RESOLVED')}
                                          className="px-2 py-1 text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow transition-all cursor-pointer"
                                        >
                                          Resolve
                                        </button>
                                      )}
                                      {t.status === 'RESOLVED' && (
                                        <span className="text-[10px] text-slate-500 italic">Closed</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                        <FolderOpen className="w-10 h-10 text-white/[0.05]" />
                        <p className="text-xs">No GLPI tickets registered for this tenant.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Building2 className="w-12 h-12 text-white/[0.05]" />
            <p className="text-sm">Select a Tenant in the left sidebar to manage.</p>
          </div>
        )}
      </main>

      {/* ─── MODAL: Criar Novo Tenant ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Add New Tenant</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {!createdCredentials ? (
                <form onSubmit={handleCreateTenant} className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Company / Customer Name</label>
                    <input
                      type="text"
                      required
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      placeholder="Ex: CWO Tech Portugal"
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
                  >
                    Create Tenant
                  </button>
                </form>
              ) : (
                <div className="space-y-4 text-xs text-slate-300">
                  <div className="px-4 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p>Customer registered successfully! Save the credentials below in a safe place.</p>
                  </div>

                  <div className="space-y-3 font-mono text-[11px]">
                    <div className="bg-black/35 p-3 rounded-lg border border-white/[0.05]">
                      <div className="text-[9px] text-slate-500 mb-1">CUSTOMER ID:</div>
                      <div className="text-white select-all break-all">{createdCredentials.id}</div>
                    </div>
                    <div className="bg-black/35 p-3 rounded-lg border border-white/[0.05]">
                      <div className="text-[9px] text-slate-500 mb-1">CUSTOMER SECRET:</div>
                      <div className="text-white select-all break-all">{createdCredentials.secret}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedCredentials(null);
                    }}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Rotacionar Customer Secret ─── */}
      {showRotateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRotateConfirm(false)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white">Rotate Customer Secret</h3>
              </div>
              <button onClick={() => setShowRotateConfirm(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-red-400 flex items-start gap-2 text-xs">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Critical Warning:</p>
                  <p className="mt-1 leading-relaxed">
                    This action will generate a new Customer Secret and revoke all active sessions and logins for this customer. Customer console users will need to reauthenticate.
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                Are you sure you want to proceed with the secret rotation for company <span className="text-white font-bold">"{selectedCustomerName}"</span>?
              </div>

              <div className="flex gap-3 pt-2 text-xs font-semibold">
                <button
                  onClick={() => setShowRotateConfirm(false)}
                  className="flex-1 py-2.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRotateSecret}
                  disabled={rotatingSecret}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {rotatingSecret ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" />
                      <span>Rotating...</span>
                    </>
                  ) : (
                    <span>Confirm Rotation</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Exibição do Novo Secret Rotacionado ─── */}
      {rotatedCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRotatedCredentials(null)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-white">Novo Segredo Gerado</h3>
              </div>
              <button onClick={() => setRotatedCredentials(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="px-4 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 flex items-start gap-2">
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce" />
                <p>The Customer Secret was rotated successfully! Save the new secret immediately.</p>
              </div>

              <div className="space-y-3 font-mono text-[11px]">
                <div className="bg-black/35 p-3 rounded-lg border border-white/[0.05]">
                  <div className="text-[9px] text-slate-500 mb-1 font-sans">CUSTOMER ID:</div>
                  <div className="text-white select-all break-all">{rotatedCredentials.id}</div>
                </div>
                <div className="bg-black/35 p-3 rounded-lg border border-white/[0.05]">
                  <div className="text-[9px] text-slate-500 mb-1 font-sans">NEW CUSTOMER SECRET:</div>
                  <div className="text-white select-all break-all font-bold">{rotatedCredentials.secret}</div>
                </div>
              </div>

              <div className="px-3 py-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] leading-relaxed">
                This secret is irreversibly stored as a hash. If you close this window, you will not be able to retrieve it again and will need to perform a new rotation.
              </div>

              <button
                onClick={() => setRotatedCredentials(null)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

