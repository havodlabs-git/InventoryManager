import React, { useState } from 'react';
import {
  Clock,
  Loader2,
  FolderOpen,
  Building,
  Search,
  Filter
} from 'lucide-react';
import type { GLPITicketRecord } from '@/app/services/api';

interface GLPITicketsHistoryPageProps {
  tickets: GLPITicketRecord[];
  loading: boolean;
}

export default function GLPITicketsHistoryPage({
  tickets,
  loading
}: GLPITicketsHistoryPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PROCESSING' | 'RESOLVED'>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'ADD' | 'REMOVE' | 'UPDATE'>('ALL');

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = 
      t.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.host_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.os?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.comments && t.comments.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesAction = actionFilter === 'ALL' || t.action_type === actionFilter;

    return matchesSearch && matchesStatus && matchesAction;
  });

  return (
    <div className="space-y-6">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
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

      <div>
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          <span>Ticket History</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">Track the triage, validation and resolution of tickets opened in GLPI.</p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tickets by host, OS, comment..."
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-[#0d1321] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-slate-300 border-0 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="PROCESSING">Processing</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0d1321] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-slate-400">
            <Building className="w-3.5 h-3.5" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as any)}
              className="bg-transparent text-slate-300 border-0 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Actions</option>
              <option value="ADD">Add Assets</option>
              <option value="REMOVE">Remove Assets</option>
              <option value="UPDATE">Update Assets</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ticket Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-slate-500">Loading history...</p>
        </div>
      ) : filteredTickets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTickets.map((t) => {
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
                className="bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl p-5 space-y-4 transition-all hover:bg-white/[0.03] flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Header: Ticket Number & Status */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white text-[11px] select-all bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.06]">
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

                  {/* Metadata Row: Action, Criticality, BU */}
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
                  </div>

                  {/* Host details */}
                  <div className="space-y-1">
                    <div className="font-bold text-white text-sm">{t.host_name}</div>
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
                    <div className="text-[10px] bg-emerald-500/5 border border-emerald-500/10 rounded p-2 text-emerald-300/90 italic font-medium">
                      <span className="font-bold not-italic block text-[9px] text-emerald-400/80 mb-0.5">GLPI Resolution:</span>
                      {t.last_comment}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-white/[0.04] text-right">
                  {dateStr}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
          <FolderOpen className="w-12 h-12 text-white/[0.05]" />
          <p className="text-sm">No tickets found.</p>
        </div>
      )}
    </div>
  );
}
