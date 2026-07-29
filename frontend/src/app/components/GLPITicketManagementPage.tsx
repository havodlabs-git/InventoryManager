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

      <div className="max-w-3xl mx-auto">
        {/* Formulário de Abertura de Ticket (GLPI) */}
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-6 h-fit space-y-5">
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
      </div>
    </div>
  );
}
