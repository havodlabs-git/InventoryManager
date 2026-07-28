import { useMemo } from 'react';
import {
  Database,
  RefreshCcw,
  Server,
  Cloud,
  Activity,
  Upload,
  Clock,
  ExternalLink
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import type { AssetRecord, GLPITicketRecord } from '@/app/services/api';

interface DashboardPageProps {
  assets: AssetRecord[];
  tickets?: GLPITicketRecord[];
  loading: boolean;
  onRefresh: () => void;
  customerName: string;
  syncStatus?: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  lastSyncAt?: string | null;
  onDrilldown: (filters: { type?: string; module?: string; search?: string }) => void;
}

const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];

export function DashboardPage({
  assets,
  tickets = [],
  loading,
  onRefresh,
  customerName,
  syncStatus = 'IDLE',
  lastSyncAt,
  onDrilldown
}: DashboardPageProps) {
  
  // 1. Processar Métricas Gerais
  const stats = useMemo(() => {
    const total = assets.length;
    const vmCount = assets.filter(a => a.module === 'InsightVM').length;
    const csCount = assets.filter(a => a.module === 'InsightCloudSec').length;
    const idrCount = assets.filter(a => a.module === 'InsightIDR').length;
    const excelCount = assets.filter(a => a.module === 'Excel Import').length;

    return { total, vmCount, csCount, idrCount, excelCount };
  }, [assets]);

  // 2. Gráfico: Distribuição por Sistema Operativo
  const osChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => {
      let osName = 'Unknown';
      if (a.os) {
        const lower = a.os.toLowerCase();
        if (lower.includes('windows') || lower.includes('microsoft')) {
          osName = 'Windows';
        } else if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('centos') || lower.includes('debian') || lower.includes('redhat') || lower.includes('alpine') || lower.includes('suse')) {
          osName = 'Linux';
        } else {
          osName = a.os.split(' ')[0] || 'Other';
        }
      }
      counts[osName] = (counts[osName] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  // 3. Últimos Assets Adicionados/Atualizados
  const recentAssets = useMemo(() => {
    return [...assets]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);
  }, [assets]);
 
  // 4. Processar Métricas de Chamados
  const ticketStats = useMemo(() => {
    const open = tickets.filter(t => t.status === 'OPEN').length;
    const processing = tickets.filter(t => t.status === 'PROCESSING').length;
    const resolved = tickets.filter(t => t.status === 'RESOLVED').length;
    const active = open + processing;
    return { open, processing, resolved, active };
  }, [tickets]);

  return (
    <div className="space-y-6">
      {/* Top Welcome / Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white/[0.02] border border-white/[0.06] p-6 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard — {customerName}</h1>
          <p className="text-xs text-slate-400 mt-1">Security statistics and CWO unified inventory.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Last Sync</p>
            <p className="text-xs text-slate-300 font-mono">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never Synchronized'}
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading || syncStatus === 'RUNNING'}
            className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 disabled:opacity-50 transition-colors"
            title="Refresh data"
          >
            <RefreshCcw className={`w-4 h-4 ${loading || syncStatus === 'RUNNING' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sync Banner Status */}
      {syncStatus === 'RUNNING' && (
        <div className="px-4 py-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center gap-3 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-semibold">Background sync in progress with Rapid7 API...</span>
        </div>
      )}

      {syncStatus === 'FAILED' && (
        <div className="px-4 py-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-semibold">Automatic synchronization failed. Check the Integrations tab.</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Total Assets */}
        <div 
          onClick={() => onDrilldown({})}
          className="bg-white/[0.02] border border-white/[0.08] hover:border-blue-500/30 hover:bg-white/[0.04] transition-all rounded-xl p-5 flex items-start gap-4 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/25 transition-colors">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Assets</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>
        </div>

        {/* Active Tickets */}
        <div className="bg-white/[0.02] border border-white/[0.08] hover:border-amber-500/30 hover:bg-white/[0.04] transition-all rounded-xl p-5 flex items-start gap-4 group">
          <div className="w-10 h-10 rounded-lg bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/25 transition-colors">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Tickets (Open / Processing)</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold text-white">{ticketStats.active}</p>
              <span className="text-[10px] text-slate-400">({ticketStats.open} open, {ticketStats.processing} in triage)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos e Seções */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição por Sistema Operativo (Pie Chart) - Ocupa 1 coluna */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4 lg:col-span-1">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Operating Systems</h3>
            <p className="text-[11px] text-slate-500">Click on slices to filter the inventory.</p>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {osChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={osChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(data) => {
                      if (data && data.name) {
                        onDrilldown({ search: data.name });
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {osChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}
                    itemStyle={{ color: '#f8fafc', fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} layout="horizontal" align="center" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-lg">
                No operating system found.
              </div>
            )}
          </div>
        </div>

        {/* Últimos Assets Adicionados (Table) - Ocupa 2 colunas */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">Last Synchronized Assets</h3>
              <p className="text-[11px] text-slate-500">Recently added or updated assets.</p>
            </div>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          
          {recentAssets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-500">
                    <th className="py-2.5 font-semibold">Name</th>
                    <th className="py-2.5 font-semibold">Source</th>
                    <th className="py-2.5 font-semibold">Type</th>
                    <th className="py-2.5 font-semibold">IP Address</th>
                    <th className="py-2.5 font-semibold">OS</th>
                    <th className="py-2.5 font-semibold text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAssets.map((asset) => (
                    <tr 
                      key={asset.id} 
                      onClick={() => onDrilldown({ type: asset.type, module: asset.module })}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors text-slate-300 cursor-pointer group"
                      title="Click to filter by this type and module"
                    >
                      <td className="py-3 font-semibold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1">
                        <span className="truncate max-w-[130px]">{asset.name}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          asset.module === 'InsightVM' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' :
                          asset.module === 'InsightCloudSec' ? 'bg-cyan-600/10 text-cyan-400 border-cyan-500/20' :
                          asset.module === 'InsightIDR' ? 'bg-purple-600/10 text-purple-400 border-purple-500/20' :
                          'bg-emerald-600/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {asset.module}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400 font-medium">{asset.type}</td>
                      <td className="py-3 font-mono">{asset.ip_address || 'N/A'}</td>
                      <td className="py-3 truncate max-w-[120px]">{asset.os || 'N/A'}</td>
                      <td className="py-3 text-right text-slate-500 font-mono">
                        {new Date(asset.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-20 text-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-xl flex flex-col justify-center items-center gap-2">
              <Database className="w-8 h-8 text-white/[0.05]" />
              <span>No assets imported to analyze.</span>
            </div>
          )}
        </div>
       </div>
 
       {/* Secção de Chamados Ativos */}
       <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
         <div className="flex items-center justify-between">
           <div>
             <h3 className="text-sm font-bold text-white tracking-wide">Active GLPI Tickets</h3>
             <p className="text-[11px] text-slate-500">Tickets currently in OPEN or PROCESSING status.</p>
           </div>
           <Clock className="w-4 h-4 text-slate-500" />
         </div>
         
         {tickets.filter(t => t.status === 'OPEN' || t.status === 'PROCESSING').length > 0 ? (
           <div className="overflow-x-auto">
             <table className="w-full text-xs text-left">
               <thead>
                 <tr className="border-b border-white/[0.06] text-slate-500 font-semibold">
                   <th className="py-2.5">Ticket No.</th>
                   <th className="py-2.5">Type</th>
                   <th className="py-2.5">Hostname</th>
                   <th className="py-2.5">OS</th>
                   <th className="py-2.5">Criticality</th>
                   <th className="py-2.5">BU</th>
                   <th className="py-2.5">Status</th>
                   <th className="py-2.5 text-right">Date</th>
                 </tr>
               </thead>
               <tbody>
                 {tickets.filter(t => t.status === 'OPEN' || t.status === 'PROCESSING').map((ticket) => (
                   <tr key={ticket.id} className="border-b border-white/[0.04] text-slate-300 hover:bg-white/[0.01]">
                     <td className="py-3 font-bold font-mono text-white text-[11px]">{ticket.ticket_number}</td>
                     <td className="py-3">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                         ticket.action_type === 'ADD' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' :
                         ticket.action_type === 'REMOVE' ? 'bg-purple-600/10 text-purple-400 border-purple-500/20' :
                         'bg-yellow-600/10 text-yellow-400 border-yellow-500/20'
                       }`}>
                         {ticket.action_type}
                       </span>
                     </td>
                     <td className="py-3 font-semibold text-white">{ticket.host_name}</td>
                     <td className="py-3 font-mono">{ticket.os || 'N/A'}</td>
                     <td className="py-3">
                       <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${
                         ticket.criticality === 'VERY HIGH' ? 'bg-red-600/10 text-red-500 border-red-500/30' :
                         ticket.criticality === 'HIGH' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                         ticket.criticality === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                         'bg-slate-500/10 text-slate-400 border-slate-500/30'
                       }`}>
                         {ticket.criticality}
                       </span>
                     </td>
                     <td className="py-3 uppercase font-medium">{ticket.bu}</td>
                     <td className="py-3">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                         ticket.status === 'OPEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                         'bg-amber-500/10 text-amber-400 border-amber-500/20'
                       }`}>
                         {ticket.status}
                       </span>
                     </td>
                     <td className="py-3 text-right text-slate-500">
                       {new Date(ticket.created_at).toLocaleDateString()}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         ) : (
           <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-xl flex flex-col justify-center items-center gap-2">
             <Clock className="w-6 h-6 text-white/[0.05]" />
             <span>No active tickets opened.</span>
           </div>
         )}
       </div>
     </div>
   );
}

// Loader and Alert placeholders to keep components running
function Loader2({ className }: { className?: string }) {
  return <RefreshCcw className={`animate-spin ${className || ''}`} />;
}

function AlertCircle({ className }: { className?: string }) {
  return <Clock className={`${className || ''}`} />;
}
