import { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Server,
  Cloud,
  Terminal,
  RefreshCcw,
  Save,
  CheckCircle,
  AlertTriangle,
  Play,
  Activity,
  Clock
} from 'lucide-react';
import { getRapid7Config, updateRapid7Config, triggerRapid7Sync, getSyncLogs } from '@/app/services/api';
import { Toaster, toast } from 'sonner';

interface R7ConfigPageProps {
  token: string;
}

export function R7ConfigPage({ token }: R7ConfigPageProps) {
  // Configs
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
  const [autoSyncInterval, setAutoSyncInterval] = useState(24);

  // States
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // 1. Carregar Configurações Iniciais
  const fetchConfig = async () => {
    try {
      const res = await getRapid7Config(token);
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
      setAutoSyncInterval(c.auto_sync_interval ?? 24);

      setSyncStatus(c.sync_status);
      setLastSyncAt(c.last_sync_at || null);
      setErrorMessage(c.error_message || null);
    } catch {
      toast.error('Error reading API configurations.');
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [token]);

  // 2. Poll de Logs e Status se estiver sincronizando
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (syncStatus === 'RUNNING') {
      // Bate na API a cada 1 segundo para atualizar os logs no terminal
      interval = setInterval(async () => {
        try {
          const logRes = await getSyncLogs(token);
          setLogs(logRes.logs);

          // Verifica se o status mudou na BD
          const configRes = await getRapid7Config(token);
          setSyncStatus(configRes.data.sync_status);
          setLastSyncAt(configRes.data.last_sync_at || null);
          setErrorMessage(configRes.data.error_message || null);
        } catch { /* ignore */ }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncStatus, token]);

  // Auto-scroll para o fim do terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 3. Guardar Configurações
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateRapid7Config({
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
      }, token);

      toast.success('Configuration saved successfully!');
      fetchConfig();
    } catch {
      toast.error('Error saving configuration.');
    } finally {
      setSaving(false);
    }
  };

  // 4. Iniciar Sincronismo
  const handleStartSync = async () => {
    setSyncing(true);
    setLogs([]);
    try {
      await triggerRapid7Sync(token);
      setSyncStatus('RUNNING');
      toast.info('Sync started in background.');
    } catch {
      toast.error('Error starting synchronization.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Toaster position="top-right" richColors />

      {/* Grid de Configurações das APIs */}
      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* CARD 1: InsightVM (On-Premise Console) */}
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
                className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
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
                  className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
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
                  className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Insight Platform (InsightIDR / InsightVM Cloud) */}
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
                className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Account Region</label>
              <select
                disabled={!platformEnabled}
                value={platformRegion}
                onChange={(e) => setPlatformRegion(e.target.value)}
                className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="us">United States (US)</option>
                <option value="eu">Europe (EU)</option>
                <option value="ca">Canada (CA)</option>
                <option value="au">Australia (AU)</option>
              </select>
            </div>
          </div>
        </div>

        {/* CARD 3: InsightCloudSec (DivvyCloud) */}
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
                className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
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
                className="w-full bg-white/[0.02] border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* CARD: Sincronização Automática (Agendada) */}
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
                className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] disabled:opacity-30 rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value={1}>Every 1 hour</option>
                <option value={6}>Every 6 hours</option>
                <option value={12}>Every 12 hours</option>
                <option value={24}>Every 24 hours (Daily)</option>
              </select>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              When enabled, the server will automatically sync assets at the defined interval. Sync status will be displayed on the client dashboard.
            </p>
          </div>
        </div>

        {/* CARD 4: Sync & Actions */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white mb-2">Quick Actions Panel</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Save credentials before forcing synchronization. Leave credentials blank or containing the word <strong className="text-slate-400">"mock"</strong> to run the integrated simulation.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
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

      {/* Terminal de Logs Sincronismo */}
      <div className="bg-[#04060c] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
        {/* Terminal Header */}
        <div className="bg-slate-900/50 border-b border-white/[0.08] px-4 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Sync Monitoring Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              syncStatus === 'RUNNING' ? 'bg-blue-500 animate-pulse' :
              syncStatus === 'SUCCESS' ? 'bg-emerald-500' :
              syncStatus === 'FAILED' ? 'bg-red-500' : 'bg-slate-600'
            }`} />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono">{syncStatus}</span>
          </div>
        </div>

        {/* Terminal Screen */}
        <div className="h-60 p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto space-y-1.5 bg-black/45">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="leading-relaxed whitespace-pre-wrap">{log}</div>
            ))
          ) : (
            <div className="text-slate-600 text-center py-20">
              {syncStatus === 'RUNNING' ? 'Starting terminal...' : 'Waiting for sync action...'}
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
