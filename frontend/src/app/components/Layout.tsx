import { useState } from 'react';
import {
  LayoutDashboard,
  Upload,
  List,
  ChevronLeft,
  ChevronRight,
  User,
  Menu,
  X,
  Settings,
  LogOut,
  Database,
  ClipboardList,
  Shield,
  FileText,
  History
} from 'lucide-react';
import logo from '@/assets/logo.png';
import type { AuthData } from './AuthForm';
import { UserSettingsModal, DEFAULT_SETTINGS } from './UserSettingsModal';
import type { UserSettings } from './UserSettingsModal';

export type PageId = 'dashboard' | 'inventory' | 'import' | 'integration' | 'removal_requests' | 'vulnerability_management' | 'glpi_tickets' | 'glpi_history';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',                label: 'Dashboard',                       icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'inventory',                label: 'Asset Inventory',                  icon: <List className="w-5 h-5" /> },
  { id: 'glpi_tickets',             label: 'Open Ticket',                     icon: <FileText className="w-5 h-5" /> },
  { id: 'glpi_history',             label: 'Ticket History',                  icon: <History className="w-5 h-5" /> },
  { id: 'removal_requests',         label: 'Requests',                         icon: <ClipboardList className="w-5 h-5" /> },
];

interface LayoutProps {
  auth: AuthData;
  onLogout: () => void;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
  settings?: UserSettings;
  onUpdateSettings?: (settings: UserSettings) => void;
}

export function Layout({ auth, onLogout, activePage, onNavigate, children, settings: externalSettings, onUpdateSettings: externalUpdateSettings }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<UserSettings>(() => {
    try {
      const key = `cwo_user_settings_${auth.customerId}`;
      const stored = localStorage.getItem(key);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS, displayName: auth.customerName };
    } catch {
      return { ...DEFAULT_SETTINGS, displayName: auth.customerName };
    }
  });

  const userSettings = externalSettings ?? localSettings;
  const displayName = userSettings.displayName || auth.customerName;

  const allowedPages = auth.token ? (() => {
    try {
      const payload = JSON.parse(atob(auth.token.split('.')[1]));
      if (payload.scope === 'master') {
        return ['dashboard', 'inventory', 'glpi_tickets', 'glpi_history', 'removal_requests'];
      }
      const perms = payload.permissions || [];
      const pages: PageId[] = [];
      if (perms.includes('customer:info')) pages.push('dashboard');
      if (perms.includes('asset:list')) pages.push('inventory');
      if (perms.includes('asset:create')) {
        pages.push('glpi_tickets');
        pages.push('glpi_history');
      }
      if (perms.includes('asset:delete')) pages.push('removal_requests');
      return pages;
    } catch {
      return ['dashboard'];
    }
  })() : ['dashboard'];

  const allowedNavItems = NAV_ITEMS.filter((item) => allowedPages.includes(item.id));

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleUpdateSettings = (settings: UserSettings) => {
    setLocalSettings(settings);
    try {
      localStorage.setItem(`cwo_user_settings_${auth.customerId}`, JSON.stringify(settings));
    } catch { /* ignore */ }
    if (externalUpdateSettings) externalUpdateSettings(settings);
  };

  const handleLogout = () => {
    setShowSettings(false);
    onLogout();
  };

  return (
    <div className="flex h-screen bg-[#070b13] overflow-hidden text-slate-100">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <UserSettingsModal
          auth={auth}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
          onUpdateSettings={handleUpdateSettings}
          settings={userSettings}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-30 h-full flex flex-col bg-[#0d1321] text-slate-100 border-r border-white/[0.08] transition-all duration-300
          ${collapsed ? 'w-16' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Logo / Brand */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/[0.08] ${collapsed ? 'justify-center' : ''}`}>
          <img
            src={logo}
            alt="MEO"
            className={`object-contain flex-shrink-0 ${collapsed ? 'h-7 w-auto' : 'h-8 w-auto'}`}
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight text-white tracking-wide">CWO</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {allowedNavItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                title={collapsed ? item.label : undefined}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                  ${active
                    ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-500'
                    : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User info + actions */}
        <div className="border-t border-white/[0.08] p-3 space-y-1">
          <button
            onClick={() => setShowSettings(true)}
            title={collapsed ? 'Settings' : undefined}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.02] transition-all group ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {initials || <User className="w-4 h-4" />}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#0d1321] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Settings className="w-2 h-2 text-slate-300" />
              </div>
            </div>
            {!collapsed && (
              <div className="overflow-hidden flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-200 truncate">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate font-mono">{auth.customerId.slice(0, 8)}…</p>
              </div>
            )}
            {!collapsed && (
              <Settings className="w-3.5 h-3.5 text-slate-500 group-hover:text-white flex-shrink-0 transition-colors" />
            )}
          </button>

          <button
            onClick={onLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-900 border border-white/[0.08] hover:bg-blue-600 rounded-full items-center justify-center text-slate-300 shadow-md transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-[#0b101c] border-b border-white/[0.08] px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-white/[0.05]"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {NAV_ITEMS.find((n) => n.id === activePage)?.label}
            </h2>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
          >
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {initials || <User className="w-3 h-3" />}
              </div>
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{displayName}</span>
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-[#070b13] to-[#04060b]">
          {children}
        </main>
      </div>
    </div>
  );
}
