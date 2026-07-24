import { useState, useEffect } from 'react';
import { listGLPITickets } from '@/app/services/api';
import type { GLPITicketRecord } from '@/app/services/api';
import { Loader2, Trash2, Clock, Building, PlusCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';

interface RemovalRequestsPageProps {
  token: string;
}

type TabId = 'tickets_add' | 'tickets_remove';

export default function RemovalRequestsPage({ token }: RemovalRequestsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('tickets_add');
  const [tickets, setTickets] = useState<GLPITicketRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resTickets = await listGLPITickets(token);
      setTickets(resTickets.data || []);
    } catch (err: unknown) {
      toast.error('Error loading requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const addTickets = tickets.filter(t => t.action_type === 'ADD');
  const removeTickets = tickets.filter(t => t.action_type === 'REMOVE');

  return (
    <div className="space-y-6">
      <Toaster richColors position="top-right" theme="dark" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white/[0.02] border border-white/[0.06] p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Requests Panel</h2>
          <p className="text-xs text-slate-400 mt-1">Track the triage, validation and status of asset requests sent by your team.</p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#070b13] p-1 border border-white/[0.06] rounded-xl text-xs shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('tickets_add')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all font-semibold ${
              activeTab === 'tickets_add' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Additions via Ticket</span>
          </button>
          <button
            onClick={() => setActiveTab('tickets_remove')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all font-semibold ${
              activeTab === 'tickets_remove' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Removals via Ticket</span>
          </button>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading requests...</p>
          </div>
        ) : (
          ((activeTab === 'tickets_add' ? addTickets : removeTickets).length > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.01] text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="px-6 py-3">Ticket No.</th>
                    <th className="px-6 py-3">Hostname / OS</th>
                    <th className="px-6 py-3">Criticality</th>
                    <th className="px-6 py-3">BU</th>
                    <th className="px-6 py-3">Last Comment (GLPI)</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeTab === 'tickets_add' ? addTickets : removeTickets).map((t) => {
                    const dateStr = new Date(t.created_at).toLocaleString('pt-PT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    return (
                      <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors text-slate-300">
                        <td className="px-6 py-4 font-bold font-mono text-white select-all">{t.ticket_number}</td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{t.host_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{t.os}</div>
                        </td>
                        <td className="px-6 py-4">
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
                        <td className="px-6 py-4 uppercase font-semibold text-slate-400">
                          <div className="flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-slate-600" />
                            <span>{t.bu}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-[250px] truncate text-slate-400" title={t.last_comment || 'No comments'}>
                          {t.last_comment || <span className="text-slate-600 italic">No comments</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                            t.status === 'OPEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            t.status === 'PROCESSING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {t.status === 'OPEN' ? 'Open' : t.status === 'PROCESSING' ? 'Processing' : 'Resolved'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-500 font-mono">{dateStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <Clock className="w-10 h-10 text-white/[0.08]" />
              <p className="text-xs">No tickets found for this type of request.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
