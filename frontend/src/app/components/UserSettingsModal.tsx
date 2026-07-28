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
  EyeOff,
  UserPlus,
  Settings,
  Trash2,
  Plus
} from 'lucide-react';
import type { AuthData } from './AuthForm';
import { MfaSetupModal } from './MfaSetupModal';
import {
  getMfaStatus,
  getCustomerMe,
  listUsers,
  createUser,
  deleteUser,
  getRBACRules,
  updateRBACRules
} from '@/app/services/api';
import type { UserRecord } from '@/app/services/api';

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

type Tab = 'profile' | 'appearance' | 'notifications' | 'security' | 'users' | 'rbac';

// Tabs will be constructed dynamically inside UserSettingsModal using isMaster check.

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

  // Dynamic Tabs & RBAC State
  const isMaster = auth.token ? (() => {
    try {
      const payload = JSON.parse(atob(auth.token.split('.')[1]));
      return payload.scope === 'master';
    } catch {
      return false;
    }
  })() : false;

  const tabsList = [
    { id: 'profile',       label: 'Profile',         icon: <User className="w-4 h-4" /> },
    { id: 'appearance',    label: 'Appearance',      icon: <Palette className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications',   icon: <Bell className="w-4 h-4" /> },
    { id: 'security',      label: 'Security',        icon: <Shield className="w-4 h-4" /> },
  ];

  if (isMaster) {
    tabsList.push(
      { id: 'users', label: 'Users', icon: <UserPlus className="w-4 h-4" /> },
      { id: 'rbac',  label: 'RBAC / Roles', icon: <Settings className="w-4 h-4" /> }
    );
  }

  // Users management state
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user' | 'readonly'>('user');
  const [usersError, setUsersError] = useState('');
  const [usersSuccess, setUsersSuccess] = useState('');

  // RBAC configuration state
  const [rbacRules, setRbacRules] = useState<Record<string, string[]>>({
    admin: ["dashboard", "inventory", "glpi_tickets", "removal_requests"],
    user: ["dashboard", "inventory"],
    readonly: ["dashboard"]
  });
  const [loadingRbac, setLoadingRbac] = useState(false);
  const [rbacError, setRbacError] = useState('');
  const [rbacSuccess, setRbacSuccess] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const res = await listUsers(auth.token);
      setUsersList(res.data || []);
    } catch (err: any) {
      setUsersError(err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [auth.token]);

  const fetchRbac = useCallback(async () => {
    setLoadingRbac(true);
    setRbacError('');
    try {
      const res = await getRBACRules(auth.token);
      setRbacRules(res.rbacRules || {
        admin: ["dashboard", "inventory", "glpi_tickets", "removal_requests"],
        user: ["dashboard", "inventory"],
        readonly: ["dashboard"]
      });
    } catch (err: any) {
      setRbacError(err.message || 'Failed to load RBAC rules');
    } finally {
      setLoadingRbac(false);
    }
  }, [auth.token]);

  useEffect(() => {
    if (activeTab === 'users' && isMaster) {
      fetchUsers();
    } else if (activeTab === 'rbac' && isMaster) {
      fetchRbac();
    }
  }, [activeTab, isMaster, fetchUsers, fetchRbac]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsersError('');
    setUsersSuccess('');
    if (!newUserEmail || !newUserPassword) {
      setUsersError('Email and Password are required');
      return;
    }
    try {
      await createUser({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole
      }, auth.token);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setUsersSuccess('User created successfully');
      fetchUsers();
    } catch (err: any) {
      setUsersError(err.message || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setUsersError('');
    setUsersSuccess('');
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await deleteUser(userId, auth.token);
      setUsersSuccess('User deleted successfully');
      fetchUsers();
    } catch (err: any) {
      setUsersError(err.message || 'Failed to delete user');
    }
  };

  const handleCheckboxChange = (role: string, page: string, checked: boolean) => {
    setRbacSuccess('');
    setRbacRules(prev => {
      const pages = prev[role] || [];
      const updatedPages = checked
        ? [...pages, page]
        : pages.filter(p => p !== page);
      return { ...prev, [role]: updatedPages };
    });
  };

  const handleSaveRbac = async () => {
    setRbacError('');
    setRbacSuccess('');
    try {
      await updateRBACRules(rbacRules, auth.token);
      setRbacSuccess('RBAC settings updated successfully!');
      window.dispatchEvent(new Event('rbac-updated'));
    } catch (err: any) {
      setRbacError(err.message || 'Failed to update RBAC rules');
    }
  };

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
            {tabsList.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
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

            {/* USER MANAGEMENT (Tenant Admin Only) */}
            {activeTab === 'users' && isMaster && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1 font-sans">User Management</h3>
                  <p className="text-xs text-slate-500 font-sans">Register and manage team members under your tenant.</p>
                </div>

                {usersError && <div className="text-xs font-semibold text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{usersError}</div>}
                {usersSuccess && <div className="text-xs font-semibold text-green-400 bg-green-500/10 p-3 rounded-lg border border-green-500/20">{usersSuccess}</div>}

                {/* Form to Register User */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">Add New User</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 font-sans">Email Address</label>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full bg-[#0a0e1a] border border-white/[0.08] px-3 py-1.5 text-xs text-white rounded-lg focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 font-sans">Password</label>
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#0a0e1a] border border-white/[0.08] px-3 py-1.5 text-xs text-white rounded-lg focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 font-sans">Role</label>
                      <select
                        value={newUserRole}
                        onChange={(e: any) => setNewUserRole(e.target.value)}
                        className="w-full bg-[#0d1321] text-slate-200 border border-white/[0.08] px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-blue-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="readonly">Read-Only</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateUser}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors font-sans"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add User
                    </button>
                  </div>
                </div>

                {/* Users List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">Existing Users</h4>
                  {loadingUsers ? (
                    <p className="text-xs text-slate-500 font-sans">Loading users...</p>
                  ) : usersList.length === 0 ? (
                    <p className="text-xs text-slate-500 font-sans">No users found.</p>
                  ) : (
                    <div className="border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.06]">
                      {usersList.map((user) => (
                        <div key={user.userId} className="flex items-center justify-between p-3 bg-black/10">
                          <div>
                            <p className="text-xs font-semibold text-slate-200 font-sans">{user.email}</p>
                            <p className="text-[10px] text-slate-500 font-mono">ID: {user.userId}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-sans ${
                              user.role === 'admin'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : user.role === 'user'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {user.role}
                            </span>
                            <button
                              onClick={() => handleDeleteUser(user.userId)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-white/[0.02] transition-colors"
                              title="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RBAC CONFIGURATION (Tenant Admin Only) */}
            {activeTab === 'rbac' && isMaster && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1 font-sans">Role-Based Access Control (RBAC)</h3>
                  <p className="text-xs text-slate-500 font-sans">Designate custom app function permissions for each user role.</p>
                </div>

                {rbacError && <div className="text-xs font-semibold text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{rbacError}</div>}
                {rbacSuccess && <div className="text-xs font-semibold text-green-400 bg-green-500/10 p-3 rounded-lg border border-green-500/20">{rbacSuccess}</div>}

                {loadingRbac ? (
                  <p className="text-xs text-slate-500 font-sans">Loading configurations...</p>
                ) : (
                  <div className="space-y-5 font-sans">
                    <div className="border border-white/[0.08] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-white/[0.08] text-slate-400 font-bold uppercase tracking-wider">
                            <th className="p-3 font-sans">Role</th>
                            <th className="p-3 text-center font-sans">Dashboard</th>
                            <th className="p-3 text-center font-sans">Asset Inventory</th>
                            <th className="p-3 text-center font-sans">Open Ticket</th>
                            <th className="p-3 text-center font-sans">Requests</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06] bg-black/10">
                          {([
                            { role: 'admin', label: 'Admin (Manager)' },
                            { role: 'user', label: 'User (Standard)' },
                            { role: 'readonly', label: 'Read-Only (Viewer)' }
                          ] as const).map((r) => (
                            <tr key={r.role} className="hover:bg-white/[0.02]">
                              <td className="p-3 font-semibold text-slate-200 font-sans">
                                {r.label}
                                <p className="text-[10px] text-slate-500 font-normal font-sans">Permissions mapping for {r.role}</p>
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={rbacRules[r.role]?.includes('dashboard') || false}
                                  onChange={(e) => handleCheckboxChange(r.role, 'dashboard', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-white/[0.15] bg-[#0a0e1a] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={rbacRules[r.role]?.includes('inventory') || false}
                                  onChange={(e) => handleCheckboxChange(r.role, 'inventory', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-white/[0.15] bg-[#0a0e1a] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={rbacRules[r.role]?.includes('glpi_tickets') || false}
                                  onChange={(e) => handleCheckboxChange(r.role, 'glpi_tickets', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-white/[0.15] bg-[#0a0e1a] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={rbacRules[r.role]?.includes('removal_requests') || false}
                                  onChange={(e) => handleCheckboxChange(r.role, 'removal_requests', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-white/[0.15] bg-[#0a0e1a] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveRbac}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-lg font-sans"
                      >
                        <Save className="w-3.5 h-3.5" /> Save Custom Roles
                      </button>
                    </div>
                  </div>
                )}
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
