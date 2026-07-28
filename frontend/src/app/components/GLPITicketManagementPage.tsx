import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  AlertTriangle,
  FolderOpen,
  Loader2,
  Clock,
  Building,
  Settings,
  PlugZap,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  UploadCloud,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import { getGLPIConfig, updateGLPIConfig, testGLPIConnection } from '@/app/services/api';
import type { GLPITicketRecord, GLPIConfigRecord } from '@/app/services/api';
import { toast } from 'sonner';

interface GLPITicketManagementPageProps {
  tickets: GLPITicketRecord[];
  loading: boolean;
  token: string;
  onSubmitTicket: (
    ticket: {
      actionType: 'ADD' | 'REMOVE' | 'UPDATE';
      hostName: string;
      os: string;
      criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
      bu: 'itcorp' | 'plural' | 'mcd' | 'bit';
      comments?: string;
    },
    file?: File | null
  ) => Promise<void>;
}

export default function GLPITicketManagementPage({
  tickets,
  loading,
  token,
  onSubmitTicket
}: GLPITicketManagementPageProps) {
  const [mode, setMode] = useState<'individual' | 'batch'>('individual');
  const [actionType, setActionType] = useState<'ADD' | 'REMOVE' | 'UPDATE'>('ADD');
  const [hostName, setHostName] = useState('');
  const [os, setOs] = useState('');
  const [comments, setComments] = useState('');
  const [criticality, setCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH'>('LOW');
  const [bu, setBu] = useState<'itcorp' | 'plural' | 'mcd' | 'bit'>('itcorp');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Configuração GLPI (credenciais) ──
  const [config, setConfig] = useState<GLPIConfigRecord | null>(null);

  const isConfigured = Boolean(config?.enabled && config?.glpi_url && config?.user_token);

  const loadConfig = useCallback(async () => {
    try {
      const res = await getGLPIConfig(token);
      setConfig(res.data);
    } catch (err) {
      console.error('Erro ao carregar configuração GLPI:', err);
    }
  }, [token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/assets/glpi-tickets/template', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_batch_hosts.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Error downloading CSV template.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) {
      toast.error('The ticket submission system is not configured by the administrator.');
      return;
    }
    if (mode === 'individual') {
      if (!hostName.trim()) {
        toast.error('Hostname is required.');
        return;
      }
      if (!os.trim()) {
        toast.error('Operating System is required.');
        return;
      }
    } else {
      if (!selectedFile) {
        toast.error('Please upload the completed CSV file.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'individual') {
        await onSubmitTicket({
          actionType,
          hostName: hostName.trim(),
          os: os.trim(),
          criticality,
          bu,
          comments: comments.trim() || undefined
        });
        // Limpar formulário
        setHostName('');
        setOs('');
        setComments('');
      } else {
        await onSubmitTicket({
          actionType: actionType as 'ADD' | 'REMOVE',
          hostName: `Batch: ${selectedFile.name}`,
          os: 'See CSV attached',
          criticality,
          bu,
          comments: comments.trim() || undefined
        }, selectedFile);
        // Limpar arquivo
        setSelectedFile(null);
        setComments('');
      }
      setCriticality('LOW');
      setBu('itcorp');
    } catch {
      // O parent já mostra toast de erro
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Colunas 1, 2, 3: Formulário de Abertura de Ticket (GLPI) */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6 h-fit space-y-5 lg:col-span-3">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span>Open Ticket</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">Request the addition or removal of assets in the unified inventory.</p>
          </div>

          {/* Toggle de Modo: Individual vs Lote */}
          <div className="bg-white/[0.04] p-1 rounded-lg border border-white/[0.08] flex text-[10px] font-semibold max-w-xs">
            <button
              type="button"
              onClick={() => setMode('individual')}
              className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer text-center ${
                mode === 'individual'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white bg-transparent'
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer text-center ${
                mode === 'batch'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white bg-transparent'
              }`}
            >
              Batch (CSV)
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tipo de Ação */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Required Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType('ADD')}
                    className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      actionType === 'ADD'
                        ? 'bg-blue-600/10 text-blue-400 border-blue-500'
                        : 'bg-transparent border-white/[0.08] text-slate-400 hover:text-white hover:border-white/[0.15]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Assets</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('REMOVE')}
                    className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      actionType === 'REMOVE'
                        ? 'bg-purple-600/10 text-purple-400 border-purple-500'
                        : 'bg-transparent border-white/[0.08] text-slate-400 hover:text-white hover:border-white/[0.15]'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Assets</span>
                  </button>
                </div>
              </div>

              {/* Business Unit */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Business Unit (BU)</label>
                <select
                  value={bu}
                  onChange={(e) => setBu(e.target.value as any)}
                  className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 h-[38px]"
                >
                  <option value="itcorp">itcorp</option>
                  <option value="plural">plural</option>
                  <option value="mcd">mcd (Media Capital)</option>
                  <option value="bit">bit</option>
                </select>
              </div>
            </div>

            {mode === 'individual' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome do Host */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hostname</label>
                  <input
                    type="text"
                    required
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Ex: mc-srv-dns02"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 h-[38px]"
                  />
                </div>

                {/* Sistema Operativo */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Operating System</label>
                  <input
                    type="text"
                    required
                    value={os}
                    onChange={(e) => setOs(e.target.value)}
                    placeholder="Ex: Ubuntu Server 22.04 LTS"
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 h-[38px]"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Download Template CSV */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between h-[98px]">
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold text-white text-[11px]">Download Template</p>
                      <p className="text-[9px] text-slate-500 leading-normal">
                        Fill template with hosts and upload.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-bold transition-colors cursor-pointer bg-transparent border-0 p-0 text-left text-[10px] mt-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download CSV Template</span>
                  </button>
                </div>

                {/* Upload Area */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Completed CSV File</label>
                  {!selectedFile ? (
                    <label className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] hover:border-blue-500/50 rounded-lg p-3 cursor-pointer bg-white/[0.01] hover:bg-blue-500/[0.01] transition-all group h-[98px]">
                      <UploadCloud className="w-6 h-6 text-slate-500 group-hover:text-blue-400 transition-colors mb-1" />
                      <span className="font-semibold text-slate-300 group-hover:text-white text-center text-[11px]">Select CSV</span>
                      <span className="text-[9px] text-slate-500 mt-0.5">Only .csv files</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.name.toLowerCase().endsWith('.csv')) {
                              setSelectedFile(file);
                            } else {
                              toast.error('Please select a CSV format file.');
                            }
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between border border-white/[0.08] bg-white/[0.02] rounded-lg p-3 h-[98px]">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="font-semibold text-white truncate text-[11px]">{selectedFile.name}</p>
                          <p className="text-[9px] text-slate-500 font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="p-1 hover:bg-white/[0.06] rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Criticidade */}
              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ticket Criticality</label>
                <select
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value as any)}
                  className="w-full bg-[#0d1321] text-slate-300 border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 h-[38px]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="VERY HIGH">VERY HIGH</option>
                </select>
              </div>

              {/* Comentários adicionais */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Comments / Justification</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional details or instructions..."
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none text-xs h-[38px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !isConfigured || (mode === 'batch' && !selectedFile)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/10 cursor-pointer text-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>{mode === 'individual' ? 'Open Ticket' : 'Open Ticket in Batch'}</span>
                </>
              )}
            </button>

            {!isConfigured && (
              <p className="text-[10px] text-amber-400/80 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Configure the credentials above to enable ticket creation.</span>
              </p>
            )}
          </form>
        </div>

        {/* Colunas 4 e 5: Histórico de Tickets Abertos */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6 space-y-4 lg:col-span-2 flex flex-col h-[525px]">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center justify-between">
              <span>Ticket History</span>
              <Clock className="w-4 h-4 text-slate-500" />
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">Track the triage and validation status of tickets.</p>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-slate-500">Loading history...</p>
              </div>
            ) : tickets.length > 0 ? (
              <div className="space-y-3">
                {tickets.map((t) => {
                  const dateStr = new Date(t.created_at).toLocaleString('pt-PT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  return (
                    <div 
                      key={t.id} 
                      className="bg-white/[0.01] border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-4 space-y-3 transition-all hover:bg-white/[0.02]"
                    >
                      {/* Header: Ticket Number & Status */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-white text-[11px] select-all bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.05]">
                          #{t.ticket_number}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                          t.status === 'OPEN'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : t.status === 'PROCESSING'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {t.status === 'OPEN' ? 'Open' : t.status === 'PROCESSING' ? 'Processing' : 'Resolved'}
                        </span>
                      </div>

                      {/* Metadata Row: Action, Criticality, BU, Date */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400 border-t border-b border-white/[0.04] py-2">
                        <span className={`px-1.5 py-0.5 rounded font-bold border ${
                          t.action_type === 'ADD'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : t.action_type === 'REMOVE'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        }`}>
                          {t.action_type === 'ADD' ? 'Add' : t.action_type === 'REMOVE' ? 'Remove' : 'Update'}
                        </span>
                        
                        <span className={`px-1.5 py-0.5 rounded font-extrabold border ${
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

                        <span className="uppercase font-semibold text-slate-500 flex items-center gap-0.5 bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                          <Building className="w-3 h-3 text-slate-600" />
                          <span>{t.bu}</span>
                        </span>
                        
                        <span className="text-[9px] text-slate-500 font-mono ml-auto">{dateStr}</span>
                      </div>

                      {/* Host details */}
                      <div className="space-y-0.5">
                        <div className="font-semibold text-white text-xs">{t.host_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{t.os}</div>
                      </div>

                      {/* Comments */}
                      {t.comments && (
                        <div className="text-[10px] bg-blue-500/5 border border-blue-500/10 rounded p-2 text-blue-300/90 italic">
                          <span className="font-bold not-italic block text-[9px] text-blue-400/80 mb-0.5">Observation:</span>
                          {t.comments}
                        </div>
                      )}
                      {t.last_comment && (
                        <div className="text-[10px] bg-emerald-500/5 border border-emerald-500/10 rounded p-2 text-emerald-300/90 italic">
                          <span className="font-bold not-italic block text-[9px] text-emerald-400/80 mb-0.5">GLPI Resolution:</span>
                          {t.last_comment}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500 py-12">
                <FolderOpen className="w-10 h-10 text-white/[0.05]" />
                <p className="text-xs">No tickets opened recently.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
