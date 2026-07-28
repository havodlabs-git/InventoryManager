import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Download,
  FileText,
  Loader2,
  X,
  PlusCircle,
  Database,
  AlertTriangle
} from 'lucide-react';
import type { AssetRecord } from '@/app/services/api';
import { addAssetManual, deleteAsset, createRemovalRequest, createGLPITicket } from '@/app/services/api';
import { Toaster, toast } from 'sonner';

const getSimpleOS = (os: string | null | undefined): 'Windows' | 'Linux' => {
  if (!os) return 'Linux';
  const lower = os.toLowerCase();
  if (lower.includes('windows') || lower.includes('microsoft')) {
    return 'Windows';
  }
  return 'Linux';
};

interface AssetsPageProps {
  assets: AssetRecord[];
  loading: boolean;
  onRefresh: () => void;
  token: string;
  initialType?: string;
  initialModule?: string;
  initialSearch?: string;
  onClearInitialFilters?: () => void;
}

export function AssetsPage({
  assets,
  loading,
  onRefresh,
  token,
  initialType,
  initialModule,
  initialSearch,
  onClearInitialFilters
}: AssetsPageProps) {
  // Estados de Filtro
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSimpleOS, setSelectedSimpleOS] = useState('');
  const [selectedFullOS, setSelectedFullOS] = useState('');

  // Estados de Ordenação
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Modais
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAssetId, setRequestAssetId] = useState('');
  const [requestAssetName, setRequestAssetName] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);

  // Modal Edição e Chamado
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editIpAddress, setEditIpAddress] = useState('');
  const [editMacAddress, setEditMacAddress] = useState('');
  const [editOs, setEditOs] = useState('');
  const [editStatus, setEditStatus] = useState('Online');
  const [editVersion, setEditVersion] = useState('');
  const [editConnection, setEditConnection] = useState('');
  const [editLastSeen, setEditLastSeen] = useState('');
  
  const [editStep, setEditStep] = useState<'form' | 'ticket'>('form');
  const [detectedChanges, setDetectedChanges] = useState<Record<string, { from: any, to: any }>>({});
  const [ticketCriticality, setTicketCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH'>('LOW');
  const [ticketBu, setTicketBu] = useState<'itcorp' | 'plural' | 'mcd' | 'bit'>('itcorp');
  const [ticketComments, setTicketComments] = useState('');
  const [ticketAutomate, setTicketAutomate] = useState(true);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // Formulário Manual Asset
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [os, setOs] = useState('');
  const [status, setStatus] = useState('Online');
  const [version, setVersion] = useState('4.1.1.55');
  const [connection, setConnection] = useState('Direct to platform');
  const [lastSeen, setLastSeen] = useState('July 1st 2026, 2:57 PM');
  const [formLoading, setFormLoading] = useState(false);

  // Efeito para receber filtros de drilldown externos
  useEffect(() => {
    if (initialType !== undefined) {
      setSelectedType(initialType);
    }
    if (initialModule !== undefined) {
      setSelectedModule(initialModule);
    }
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
    if (initialType || initialModule || initialSearch) {
      if (onClearInitialFilters) onClearInitialFilters();
    }
  }, [initialType, initialModule, initialSearch, onClearInitialFilters]);

  // 1. Extrair Statuses, Simple OS e Full OSs únicos para os filtros dropdown
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(assets.map(a => a.status || 'Online').filter(Boolean));
    return Array.from(statuses).sort();
  }, [assets]);

  const uniqueSimpleOS = ['Windows', 'Linux'];

  const uniqueFullOS = useMemo(() => {
    const oses = new Set(assets.map(a => a.os).filter(Boolean));
    return Array.from(oses).sort();
  }, [assets]);

  // 2. Filtrar e Ordenar Assets
  const filteredAssets = useMemo(() => {
    const filtered = assets.filter(asset => {
      const matchesSearch = !search || 
        asset.name.toLowerCase().includes(search.toLowerCase()) ||
        (asset.ip_address && asset.ip_address.includes(search)) ||
        (asset.os && asset.os.toLowerCase().includes(search.toLowerCase()));

      const assetStatus = asset.status || 'Online';
      const matchesStatus = !selectedStatus || assetStatus === selectedStatus;
      
      const simpleOS = getSimpleOS(asset.os);
      const matchesSimpleOS = !selectedSimpleOS || simpleOS === selectedSimpleOS;
      const matchesFullOS = !selectedFullOS || asset.os === selectedFullOS;

      const matchesModule = !selectedModule || asset.module === selectedModule;
      const matchesType = !selectedType || asset.type === selectedType;

      return matchesSearch && matchesStatus && matchesSimpleOS && matchesFullOS && matchesModule && matchesType;
    });

    if (sortField) {
      filtered.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'name') {
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
        } else if (sortField === 'status') {
          valA = (a.status || 'Online').toLowerCase();
          valB = (b.status || 'Online').toLowerCase();
        } else if (sortField === 'ip_address') {
          valA = a.ip_address || '';
          valB = b.ip_address || '';
        } else if (sortField === 'simple_os') {
          valA = getSimpleOS(a.os);
          valB = getSimpleOS(b.os);
        } else if (sortField === 'os') {
          valA = (a.os || '').toLowerCase();
          valB = (b.os || '').toLowerCase();
        } else if (sortField === 'last_scanned_at') {
          valA = a.last_scanned_at ? new Date(a.last_scanned_at).getTime() : 0;
          valB = b.last_scanned_at ? new Date(b.last_scanned_at).getTime() : 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [assets, search, selectedStatus, selectedSimpleOS, selectedFullOS, selectedModule, selectedType, sortField, sortDirection]);

  // 3. Ações
  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !type.trim()) {
      toast.error('Please fill in the required fields (Name and Type)');
      return;
    }

    setFormLoading(true);
    try {
      await addAssetManual({
        name: name.trim(),
        type: type.trim(),
        ipAddress: ipAddress.trim() || undefined,
        macAddress: macAddress.trim() || undefined,
        os: os.trim() || undefined,
        status: status.trim() || 'Online',
        version: version.trim() || '4.1.1.55',
        connection: connection.trim() || 'Direct to platform',
        lastSeen: lastSeen.trim() || 'July 1st 2026, 2:57 PM',
        riskScore: 0,
        vulnerabilitiesCount: 0
      }, token);

      toast.success('Manual asset added successfully!');
      onRefresh();
      setShowAddModal(false);
      
      // Limpar formulário
      setName(''); setType(''); setIpAddress(''); setMacAddress(''); setOs('');
      setStatus('Online'); setVersion('4.1.1.55'); setConnection('Direct to platform'); setLastSeen('July 1st 2026, 2:57 PM');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error adding asset.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteAsset(id, token);
      toast.success('Asset removed successfully!');
      onRefresh();
    } catch (err: unknown) {
      toast.error('Error removing asset.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRequestRemoval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestReason.trim()) {
      toast.error('Please justify the reason for the removal request.');
      return;
    }

    setRequestLoading(true);
    try {
      await createRemovalRequest(requestAssetId, requestReason.trim(), token);
      toast.success('Removal request submitted successfully!');
      setShowRequestModal(false);
      setRequestReason('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error requesting removal.');
    } finally {
      setRequestLoading(false);
    }
  };

  // 4. Exportação CSV
  const handleExportCSV = () => {
    if (filteredAssets.length === 0) {
      toast.error('No data to export.');
      return;
    }
    const headers = ['Hostname', 'Status', 'IP Address', 'Operating System', 'Full Operating System', 'Version', 'Connection', 'Last Scan'];
    const rows = filteredAssets.map(a => [
      a.name,
      a.status || 'Online',
      a.ip_address || 'N/A',
      getSimpleOS(a.os),
      a.os || 'N/A',
      a.version || 'N/A',
      a.connection || 'N/A',
      a.last_scanned_at ? new Date(a.last_scanned_at).toLocaleString('pt-PT') : 'N/A'
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_assets_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV exported successfully!');
  };

  // 5. Exportação PDF (Impressão Formatada)
  const handleExportPDF = () => {
    if (filteredAssets.length === 0) {
      toast.error('No data to export.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to open the PDF version.');
      return;
    }

    const rowsHtml = filteredAssets.map(a => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">${a.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.status || 'Online'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.ip_address || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${getSimpleOS(a.os)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.os || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.version || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.connection || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${a.last_scanned_at ? new Date(a.last_scanned_at).toLocaleString('pt-PT') : 'N/A'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Asset Inventory - CWO</title>
          <style>
            body { font-family: sans-serif; color: #333; margin: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #0f172a; color: white; padding: 10px; text-align: left; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>CWO - Unified Asset Inventory</h2>
            <p>Exported at: ${new Date().toLocaleString()} | Total Assets: ${filteredAssets.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>Operating System</th>
                <th>Full Operating System</th>
                <th>Version</th>
                <th>Connection</th>
                <th>Last Scan</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      <Toaster position="top-right" richColors />

      {/* Barra de Filtros e Busca */}
      <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Busca e Filtros Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Caixa de Pesquisa */}
          <div className="relative min-w-[200px] w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filtro Status */}
          <div className="relative w-full sm:w-auto">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              {uniqueStatuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filtro OS Simples */}
          <div className="relative w-full sm:w-auto">
            <select
              value={selectedSimpleOS}
              onChange={(e) => setSelectedSimpleOS(e.target.value)}
              className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">All Operating Systems</option>
              {uniqueSimpleOS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Filtro OS Completo */}
          <div className="relative w-full sm:w-auto">
            <select
              value={selectedFullOS}
              onChange={(e) => setSelectedFullOS(e.target.value)}
              className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">All OS Details</option>
              {uniqueFullOS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Indicador de Filtro de Drilldown */}
          {(selectedModule || selectedType) && (
            <button
              onClick={() => {
                setSelectedModule('');
                setSelectedType('');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors cursor-pointer"
            >
              <span>Clear Drilldown</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Tabela de Assets */}
      <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading asset inventory...</p>
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.01] text-slate-500 font-semibold uppercase tracking-wider select-none">
                  <th 
                    onClick={() => handleSort('name')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Hostname</span>
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('status')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {sortField === 'status' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('ip_address')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>IP Address</span>
                      {sortField === 'ip_address' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('simple_os')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Operating System</span>
                      {sortField === 'simple_os' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('os')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Full Operating System</span>
                      {sortField === 'os' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('last_scanned_at')} 
                    className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Last Scan</span>
                      {sortField === 'last_scanned_at' && (
                        sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => {
                  const status = asset.status || 'Online';
                  const osText = asset.os || 'N/A';
                  const simpleOS = getSimpleOS(asset.os);
                  const lowerStatus = status.toLowerCase();
                  return (
                    <tr key={asset.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors text-slate-300">
                      <td className="px-4 py-3 font-semibold text-white truncate max-w-[140px]">{asset.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          lowerStatus === 'online' || lowerStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          lowerStatus === 'offline' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          lowerStatus === 'stale' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{asset.ip_address || 'N/A'}</td>
                      <td className="px-4 py-3">{simpleOS}</td>
                      <td className="px-4 py-3 truncate max-w-[150px]" title={osText}>{osText}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {asset.last_scanned_at ? new Date(asset.last_scanned_at).toLocaleString('pt-PT') : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditAsset(asset);
                            setEditName(asset.name || '');
                            setEditType(asset.type || '');
                            setEditIpAddress(asset.ip_address || '');
                            setEditMacAddress(asset.mac_address || '');
                            setEditOs(asset.os || '');
                            setEditStatus(asset.status || 'Online');
                            setEditVersion(asset.version || '');
                            setEditConnection(asset.connection || '');
                            setEditLastSeen(asset.last_seen || '');
                            setEditStep('form');
                            setShowEditModal(true);
                          }}
                          className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 font-semibold rounded border border-blue-500/20 transition-all cursor-pointer text-[10px]"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Database className="w-10 h-10 text-white/[0.08]" />
            <p className="text-xs">No assets found with the applied filters.</p>
          </div>
        )}
      </div>

      {/* Modal Add Manual Asset */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Add Asset Manually</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddAsset} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Asset Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: cwo-srv-prod01"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Type *</label>
                  <input
                    type="text"
                    required
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="Ex: Server, Container, VM"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Operating System</label>
                  <input
                    type="text"
                    value={os}
                    onChange={(e) => setOs(e.target.value)}
                    placeholder="Ex: Windows Server 2022"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">IP Address</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="Ex: 192.168.1.10"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">MAC Address</label>
                  <input
                    type="text"
                    value={macAddress}
                    onChange={(e) => setMacAddress(e.target.value)}
                    placeholder="Ex: 00:0C:29:8E:B4:B9"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-[#0d1321] text-white border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                    <option value="Stale">Stale</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Agent Version</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="Ex: 4.1.1.55"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Connection</label>
                  <input
                    type="text"
                    value={connection}
                    onChange={(e) => setConnection(e.target.value)}
                    placeholder="Ex: MC-Collector01"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Last Scan</label>
                  <input
                    type="text"
                    value={lastSeen}
                    onChange={(e) => setLastSeen(e.target.value)}
                    placeholder="Ex: July 1st 2026, 2:57 PM"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {formLoading && <Loader2 className="w-4.5 h-4.5 animate-spin" />}
                  <span>Add Asset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Solicitar Remoção */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRequestModal(false)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-bold text-white">Request Asset Removal</h3>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRequestRemoval} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Selected asset</label>
                <div className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white font-mono">
                  {requestAssetName}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Reason for Removal *</label>
                <textarea
                  required
                  rows={4}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Justify the reason why this asset should be removed from the inventory (e.g. decommissioned, IP changed, etc.)"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none text-xs"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestLoading}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
                >
                  {requestLoading && <Loader2 className="w-4.5 h-4.5 animate-spin" />}
                  <span>Send Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Asset & Open Ticket */}
      {showEditModal && editAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  {editStep === 'form' ? `Edit Asset: ${editAsset.name}` : 'Confirm changes & Open Ticket'}
                </h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {editStep === 'form' ? (
              /* Step 1: Form */
              <form onSubmit={(e) => {
                e.preventDefault();
                const changes: Record<string, { from: any, to: any }> = {};
                const fields = {
                  name: editName,
                  type: editType,
                  ip_address: editIpAddress,
                  mac_address: editMacAddress,
                  os: editOs,
                  status: editStatus,
                  version: editVersion,
                  connection: editConnection,
                  last_seen: editLastSeen
                };
                for (const [key, value] of Object.entries(fields)) {
                  const originalVal = (editAsset as any)[key] || '';
                  const newVal = value || '';
                  if (String(originalVal).trim() !== String(newVal).trim()) {
                    changes[key] = { from: originalVal, to: newVal };
                  }
                }
                if (Object.keys(changes).length === 0) {
                  toast.error('No changes detected. Modify at least one field.');
                  return;
                }
                setDetectedChanges(changes);
                setTicketCriticality('LOW');
                setTicketBu('itcorp');
                setTicketComments('');
                setTicketAutomate(true);
                setEditStep('ticket');
              }} className="p-6 space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Asset Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Type *</label>
                    <input
                      type="text"
                      required
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Operating System</label>
                    <input
                      type="text"
                      value={editOs}
                      onChange={(e) => setEditOs(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">IP Address</label>
                    <input
                      type="text"
                      value={editIpAddress}
                      onChange={(e) => setEditIpAddress(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">MAC Address</label>
                    <input
                      type="text"
                      value={editMacAddress}
                      onChange={(e) => setEditMacAddress(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-[#0d1321] text-white border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Stale">Stale</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Agent Version</label>
                    <input
                      type="text"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Connection</label>
                    <input
                      type="text"
                      value={editConnection}
                      onChange={(e) => setEditConnection(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Last Scan</label>
                    <input
                      type="text"
                      value={editLastSeen}
                      onChange={(e) => setEditLastSeen(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-semibold"
                  >
                    Review & Open Ticket
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Pre-opening Ticket Confirmation */
              <form onSubmit={async (e) => {
                e.preventDefault();
                setTicketSubmitting(true);
                try {
                  const changeLines = Object.entries(detectedChanges).map(([key, diff]) => {
                    return `- ${key.toUpperCase()}: "${diff.from || 'N/A'}" ➜ "${diff.to || 'N/A'}"`;
                  });
                  const formattedComment = [
                    `Alterações de ativo detetadas automaticamente:`,
                    ...changeLines,
                    ticketComments ? `\nComentário do Utilizador:\n${ticketComments}` : ''
                  ].filter(Boolean).join('\n');

                  const assetChanges = Object.fromEntries(
                    Object.entries(detectedChanges).map(([key, diff]) => [key, diff.to])
                  );

                  await createGLPITicket({
                    actionType: 'UPDATE',
                    hostName: editName.trim() || editAsset.name,
                    os: editOs.trim() || editAsset.os || 'N/A',
                    criticality: ticketCriticality,
                    bu: ticketBu,
                    comments: formattedComment,
                    assetId: editAsset.id,
                    automate: ticketAutomate,
                    assetChanges
                  }, token);

                  toast.success('Update asset ticket opened successfully!');
                  setShowEditModal(false);
                  onRefresh();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : 'Error opening update ticket.');
                } finally {
                  setTicketSubmitting(false);
                }
              }} className="p-6 space-y-4 text-xs">
                {/* Lista de Alterações */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Detected Changes</label>
                  <div className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg p-3 space-y-1.5 max-h-[140px] overflow-y-auto font-mono">
                    {Object.entries(detectedChanges).map(([key, diff]) => (
                      <div key={key} className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-bold text-slate-400 uppercase">{key.replace('_', ' ')}:</span>
                        <span className="text-red-400 line-through truncate max-w-[120px]">{String(diff.from || 'N/A')}</span>
                        <span className="text-slate-600">➜</span>
                        <span className="text-emerald-400 font-semibold truncate max-w-[120px]">{String(diff.to || 'N/A')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ticket Criticality</label>
                    <select
                      value={ticketCriticality}
                      onChange={(e) => setTicketCriticality(e.target.value as any)}
                      className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="VERY HIGH">VERY HIGH</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Business Unit (BU)</label>
                    <select
                      value={ticketBu}
                      onChange={(e) => setTicketBu(e.target.value as any)}
                      className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    >
                      <option value="itcorp">itcorp</option>
                      <option value="plural">plural</option>
                      <option value="mcd">mcd (Media Capital)</option>
                      <option value="bit">bit</option>
                    </select>
                  </div>
                </div>

                {/* Comentários / Justificativa */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Comments / Justification</label>
                  <textarea
                    value={ticketComments}
                    onChange={(e) => setTicketComments(e.target.value)}
                    placeholder="Enter justification for this change request..."
                    rows={2}
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none text-xs"
                  />
                </div>

                {/* Checkbox de Automação */}
                <label className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-500/[0.03] border border-blue-500/20 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ticketAutomate}
                    onChange={(e) => setTicketAutomate(e.target.checked)}
                    className="rounded border-white/[0.08] text-blue-600 focus:ring-blue-500 h-4 w-4 bg-transparent"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Automate update upon resolution (Automação)</span>
                    <p className="text-[9px] text-slate-500 leading-normal mt-0.5">
                      If resolved/closed, the asset will be updated automatically in the inventory.
                    </p>
                  </div>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditStep('form')}
                    className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-lg text-slate-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={ticketSubmitting}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
                  >
                    {ticketSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Confirm & Open Ticket</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
