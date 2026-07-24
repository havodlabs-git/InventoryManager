import { useState, useEffect, useCallback } from 'react';
import {
  X,
  User,
  Bell,
  Palette,
  Shield,
  Save,
  CheckCircle,
  LogOut,
  Moon,
  Sun,
  Monitor,
  ChevronRight,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import type { AuthData } from './AuthForm';
import { MfaSetupModal } from './MfaSetupModal';
import { getMfaStatus, getCustomerMe } from '@/app/services/api';

interface UserSettingsModalProps {
  auth: AuthData;
  onClose: () => void;
  onLogout: () => void;
  onUpdateSettings: (settings: UserSettings) => void;
  settings: UserSettings;
}

export interface UserSettings {
  displayName: string;
  theme: 'light' | 'dark' | 'system';
  notifyOnSync: boolean;
  notifyOnUpload: boolean;
  tablePageSize: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: '',
  theme: 'dark',
  notifyOnSync: true,
  notifyOnUpload: true,
  tablePageSize: 50,
};

type Tab = 'profile' | 'appearance' | 'notifications' | 'security';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',       label: 'Profile',         icon: <User className="w-4 h-4" /> },
  { id: 'appearance',    label: 'Appearance',      icon: <Palette className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifications',   icon: <Bell className="w-4 h-4" /> },
  { id: 'security',      label: 'Security',        icon: <Shield className="w-4 h-4" /> },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-blue-600' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

export function UserSettingsModal({ auth, onClose, onLogout, onUpdateSettings, settings }: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [form, setForm] = useState<UserSettings>({ ...settings });
  const [saved, setSaved] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const fetchMfaStatus = useCallback(async () => {
    try {
      if (!auth.token) {
        setMfaEnabled(false);
        return;
      }
      const res = await getMfaStatus(auth.token);
      setMfaEnabled(res.mfaEnabled);
    } catch {
      setMfaEnabled(false);
    }
  }, [auth.token]);

  useEffect(() => {
    if (activeTab === 'security') fetchMfaStatus();
  }, [activeTab, fetchMfaStatus]);

  const initials = (form.displayName || auth.customerName)
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    onUpdateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(auth.token).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl z-10 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{form.displayName || auth.customerName}</p>
              <p className="text-xs text-slate-400 font-mono">{auth.customerId.slice(0, 12)}…</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar tabs */}
          <div className="w-44 flex-shrink-0 bg-black/20 border-r border-white/[0.06] py-3 flex flex-col">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-white/[0.05] text-blue-400 border-r-2 border-blue-500'
                    : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                }`}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && <ChevronRight className="w-3 h-3 ml-auto text-blue-400" />}
              </button>
            ))}

            <div className="flex-1" />

            <button
              onClick={onLogout}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors mx-2 rounded-lg"
            >
              <LogOut className="w-4 h-4" />Logout
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#0a0e1a]">

            {/* PERFIL */}
            {activeTab === 'profile' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">Profile Info</h3>
                  <p className="text-xs text-slate-500">Customize your display name.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Display name</label>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => set('displayName', e.target.value)}
                    placeholder={auth.customerName}
                    className="w-full bg-white/[0.02] border border-white/[0.08] px-3 py-2 text-sm text-white rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500">Leave blank to use default corporate name.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer ID</label>
                  <div className="px-3 py-2 text-sm bg-black/20 border border-white/[0.08] rounded-lg font-mono text-slate-400 select-all">
                    {auth.customerId}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Records per page</label>
                  <select
                    value={form.tablePageSize}
                    onChange={(e) => set('tablePageSize', Number(e.target.value))}
                    className="w-full bg-[#0d1321] text-slate-200 border border-white/[0.08] px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    {[25, 50, 100, 200].map((n) => (
                      <option key={n} value={n}>{n} assets</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* APARÊNCIA */}
            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">Appearance</h3>
                  <p className="text-xs text-slate-500">Choose your preferred theme.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'light',  label: 'Light',   icon: <Sun className="w-5 h-5" /> },
                      { value: 'dark',   label: 'Dark',  icon: <Moon className="w-5 h-5" /> },
                      { value: 'system', label: 'System', icon: <Monitor className="w-5 h-5" /> },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('theme', opt.value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          form.theme === opt.value
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-white/[0.08] bg-white/[0.01] text-slate-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {opt.icon}
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Currently optimized for cyber dark theme.</p>
                </div>
              </div>
            )}

            {/* NOTIFICAÇÕES */}
            {activeTab === 'notifications' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">Notifications</h3>
                  <p className="text-xs text-slate-500">Configure integrity and audit alerts.</p>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Synchronization Alerts</p>
                    <p className="text-xs text-slate-500 mt-0.5">Notify when sync with Rapid7 fails.</p>
                  </div>
                  <Toggle checked={form.notifyOnSync} onChange={(v) => set('notifyOnSync', v)} />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Notify Excel Import</p>
                    <p className="text-xs text-slate-500 mt-0.5">Summary upon completing spreadsheet imports.</p>
                  </div>
                  <Toggle checked={form.notifyOnUpload} onChange={(v) => set('notifyOnUpload', v)} />
                </div>
              </div>
            )}

            {/* SEGURANÇA */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">Security and Tokens</h3>
                  <p className="text-xs text-slate-500">Session JWT token and MFA configuration.</p>
                </div>

                <div className="space-y-4">
                  {/* Token */}
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Session API Token</p>
                      <span className="text-xs text-slate-500 font-mono">Bearer JWT</span>
                    </div>
                    <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2">
                      <code className="flex-1 text-xs font-mono text-slate-400 truncate">
                        {showToken ? auth.token : '•'.repeat(48)}
                      </code>
                      <button
                        onClick={() => setShowToken((v) => !v)}
                        className="text-slate-400 hover:text-blue-400 p-0.5 transition-colors"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={handleCopyToken}
                        className="text-slate-400 hover:text-blue-400 p-0.5 transition-colors"
                      >
                        {tokenCopied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* MFA */}
                  <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Two-Factor Authentication (MFA)</p>
                        <p className="text-xs text-slate-500 mt-0.5">TOTP code-based security for Microsoft Authenticator.</p>
                      </div>
                      {mfaEnabled === null ? (
                        <span className="text-xs text-slate-500">Verifying...</span>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          mfaEnabled ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {mfaEnabled ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowMfaModal(true)}
                      className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors ${
                        mfaEnabled
                          ? 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {mfaEnabled ? 'Disable MFA Authentication' : 'Configure MFA Authentication'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] bg-gradient-to-r from-slate-900 to-slate-800">
          <p className="text-xs text-slate-500">Settings are securely stored.</p>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {saved ? (
              <><CheckCircle className="w-4 h-4" />Saved!</>
            ) : (
              <><Save className="w-4 h-4" />Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>

    {showMfaModal && (
      <MfaSetupModal
        token={auth.token}
        mfaEnabled={mfaEnabled === true}
        onClose={() => setShowMfaModal(false)}
        onStatusChange={(enabled) => {
          setMfaEnabled(enabled);
          setShowMfaModal(false);
        }}
      />
    )}
    </>
  );
}
