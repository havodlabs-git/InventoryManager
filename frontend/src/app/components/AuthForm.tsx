import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Key,
  Shield,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Fingerprint,
  Lock,
  Eye,
  EyeOff,
  Activity,
  Globe,
  Server,
  ShieldCheck,
  ChevronRight,
  Database,
  Grid
} from 'lucide-react';
import logo from '@/assets/logo-dark.png';
import { getCustomerToken, getCustomerMe, getMfaStatus, validateMfaLogin, registerCustomer } from '@/app/services/api';

export interface AuthData {
  customerId: string;
  customerSecret: string;
  customerName: string;
  token: string;
}

interface AuthFormProps {
  onAuthenticate: (data: AuthData) => Promise<void> | void;
}

type Step = 'credentials' | 'mfa' | 'register';

async function validateAdminKeyHelper(key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/customer/list', {
      headers: { 'x-admin-key': key }
    });
    return res.ok;
  } catch { return false; }
}


/* ─── Animated grid background ─────────────────────────────────────────────── */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0d1321] to-[#0a0f1f]" />

      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[150px]" />
    </div>
  );
}

/* ─── Floating particles ───────────────────────────────────────────────────── */
function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
      opacity: Math.random() * 0.3 + 0.1,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-blue-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animation: `float-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes float-particle {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.2; }
          25% { transform: translate(15px, -20px) scale(1.2); }
          50% { transform: translate(-10px, -35px) scale(0.8); opacity: 0.3; }
          75% { transform: translate(20px, -15px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}

/* ─── Left panel feature items ─────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <Database className="w-5 h-5" />,
    title: 'Centralized Asset Inventory',
    desc: 'Search, filter and classify all your servers, computers and cloud instances.',
  },
  {
    icon: <Server className="w-5 h-5" />,
    title: 'Automated Rapid7 Integration',
    desc: 'Sync assets automatically via the InsightVM, InsightCloudSec and InsightIDR APIs.',
  },
  {
    icon: <Grid className="w-5 h-5" />,
    title: 'Excel Spreadsheet Importer',
    desc: 'Add assets in batch easily using custom spreadsheets.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'MFA & Data Isolation',
    desc: 'Robust access control with Multi-Factor Authentication per isolated tenant.',
  },
];

export function AuthForm({ onAuthenticate }: AuthFormProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [showPassword, setShowPassword] = useState(false);

  // Credentials step
  const [customerId, setCustomerId] = useState('');
  const [customerSecret, setCustomerSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register step
  const [registerName, setRegisterName] = useState('');
  const [newCredentials, setNewCredentials] = useState<{ id: string; secret: string } | null>(null);

  // MFA step
  const [pendingAuth, setPendingAuth] = useState<AuthData | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'mfa' && mfaInputRef.current) {
      mfaInputRef.current.focus();
    }
  }, [step]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!customerId.trim()) { setError('Please enter the Customer ID'); return; }
    if (!customerSecret.trim()) { setError('Please enter the Customer Secret'); return; }

    setLoading(true);
    try {
      const isSecretAdminKey = await validateAdminKeyHelper(customerSecret.trim());
      if (isSecretAdminKey) {
        // Bypass para conta admin (caso queira usar X-Admin-Key)
        const adminAuthData: AuthData = {
          customerId: 'admin',
          customerSecret: customerSecret.trim(),
          customerName: 'Administrator',
          token: '',
        };
        await onAuthenticate(adminAuthData);
        return;
      }

      const res = await getCustomerToken(customerId.trim(), customerSecret.trim());

      let customerName = customerId.trim();
      try {
        const me = await getCustomerMe(res.token);
        customerName = me.name || customerId.trim();
      } catch { /* fallback */ }

      const authData: AuthData = {
        customerId: customerId.trim(),
        customerSecret: customerSecret.trim(),
        customerName,
        token: res.token,
      };

      let mfaEnabled = false;
      try {
        const mfaStatus = await getMfaStatus(res.token);
        mfaEnabled = mfaStatus.mfaEnabled;
      } catch { /* MFA not configured */ }

      if (mfaEnabled) {
        setPendingAuth(authData);
        setMfaCode('');
        setMfaError('');
        setStep('mfa');
      } else {
        await onAuthenticate(authData);
      }
    } catch (err: unknown) {
      setError('Invalid credentials. Please verify your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAuth) return;
    const clean = mfaCode.replace(/\s/g, '');
    if (clean.length !== 6) { setMfaError('Enter the 6-digit code.'); return; }

    setMfaLoading(true);
    setMfaError('');
    try {
      await validateMfaLogin(pendingAuth.customerId, clean);
      await onAuthenticate(pendingAuth);
    } catch (err: unknown) {
      setMfaError('Invalid code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!registerName.trim()) { setError('Enter company name.'); return; }

    setLoading(true);
    try {
      const res = await registerCustomer(registerName.trim());
      setNewCredentials({ id: res.customerId, secret: res.customerSecret });
    } catch (err: unknown) {
      setError('Error registering customer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaCodeChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setMfaCode(clean);
    setMfaError('');
  };

  return (
    <div className="relative flex min-h-screen w-full">
      <GridBackground />
      <FloatingParticles />

      {/* ── Left Panel (decorative) ── */}
      <div className="hidden lg:flex lg:w-[52%] relative z-10 flex-col justify-between p-12 xl:p-16">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <img src={logo} alt="MEO Empresas" className="h-10 w-auto" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-blue-500/60 to-transparent" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-blue-400/70">
              Cyber Warfare Operations
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center -mt-8">
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
            CWO
          </h1>
          <p className="text-lg text-slate-400 max-w-md leading-relaxed mb-12">
            Control, automation, and management of cyber asset inventory and direct Rapid7 integration.
          </p>

          <div className="space-y-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-4 group">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-blue-400 group-hover:bg-blue-500/10 group-hover:border-blue-500/20 transition-all duration-300">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-0.5">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active</span>
          </div>
          <span className="text-slate-700">|</span>
          <span>&copy; {new Date().getFullYear()} MEO Empresas</span>
        </div>
      </div>

      {/* ── Right Panel (forms) ── */}
      <div className="flex-1 relative z-10 flex items-center justify-center p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-[440px]">
          <div className="flex lg:hidden justify-center mb-8">
            <img src={logo} alt="MEO Empresas" className="h-8 w-auto" />
          </div>

          <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            <div className="p-8 sm:p-10">
              {/* ── STEP 1: Credentials ── */}
              {step === 'credentials' && (
                <div className="animate-in fade-in duration-300">
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                        <Fingerprint className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">
                          {new URLSearchParams(window.location.search).get('admin') === '1' ? 'Admin Access' : 'Authentication'}
                        </h2>
                        <p className="text-xs text-slate-500">
                          {new URLSearchParams(window.location.search).get('admin') === '1' ? 'Enter administrative API key' : 'Secure access to the inventory dashboard'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleCredentials} className="space-y-5">
                    <div className="space-y-2">
                      <label htmlFor="customerId" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Customer ID
                      </label>
                      <div className={`relative group rounded-xl border transition-all duration-200 ${
                        focusedField === 'id'
                          ? 'border-blue-500/50 bg-blue-500/[0.03] shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                      }`}>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <Key className={`h-4 w-4 transition-colors duration-200 ${
                            focusedField === 'id' ? 'text-blue-400' : 'text-slate-600'
                          }`} />
                        </div>
                        <input
                          type="text"
                          id="customerId"
                          value={customerId}
                          onChange={(e) => { setCustomerId(e.target.value); setError(''); }}
                          onFocus={() => setFocusedField('id')}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Enter your Customer ID"
                          className="w-full bg-transparent pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 font-mono focus:outline-none"
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="customerSecret" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Customer Secret
                      </label>
                      <div className={`relative group rounded-xl border transition-all duration-200 ${
                        focusedField === 'secret'
                          ? 'border-blue-500/50 bg-blue-500/[0.03] shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                      }`}>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <Lock className={`h-4 w-4 transition-colors duration-200 ${
                            focusedField === 'secret' ? 'text-blue-400' : 'text-slate-600'
                          }`} />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="customerSecret"
                          value={customerSecret}
                          onChange={(e) => { setCustomerSecret(e.target.value); setError(''); }}
                          onFocus={() => setFocusedField('secret')}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Enter your Customer Secret"
                          className="w-full bg-transparent pl-10 pr-11 py-3 text-sm text-white placeholder-slate-600 focus:outline-none"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-600 hover:text-slate-400 transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="relative w-full group overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 text-sm font-semibold transition-all duration-300 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4.5 h-4.5 animate-spin" />
                          <span>Logging in...</span>
                        </>
                      ) : (
                        <>
                          <span>Login</span>
                          <ChevronRight className="w-4.5 h-4.5 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </button>
                  </form>


                </div>
              )}

              {/* ── STEP 2: MFA ── */}
              {step === 'mfa' && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex flex-col items-center mb-8 gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Shield className="w-8 h-8 text-blue-400" />
                      </div>
                      <div className="absolute inset-0 rounded-2xl border border-blue-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-lg font-bold text-white tracking-tight">MFA Verification</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Enter the code from your authenticator app
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleMfa} className="space-y-5">
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">
                        6-digit code
                      </label>
                      <div className={`relative rounded-xl border transition-all duration-200 ${
                        focusedField === 'mfa'
                          ? 'border-blue-500/50 bg-blue-500/[0.03] shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}>
                        <input
                          ref={mfaInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={mfaCode}
                          onChange={(e) => handleMfaCodeChange(e.target.value)}
                          onFocus={() => setFocusedField('mfa')}
                          onBlur={() => setFocusedField(null)}
                          placeholder="000000"
                          className="w-full bg-transparent text-center text-3xl font-mono tracking-[0.5em] text-white placeholder-slate-700 px-4 py-4 focus:outline-none"
                        />
                      </div>
                      {mfaError && (
                        <div className="flex items-center justify-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm text-red-300">{mfaError}</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={mfaLoading || mfaCode.length !== 6}
                      className="relative w-full group overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 text-sm font-semibold transition-all duration-300 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2"
                    >
                      {mfaLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Verify and Login</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setStep('credentials'); setPendingAuth(null); setMfaCode(''); setMfaError(''); }}
                      className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors py-2 rounded-lg hover:bg-white/[0.03]"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to login</span>
                    </button>
                  </form>
                </div>
              )}

              {/* ── STEP 3: Register Tenant ── */}
              {step === 'register' && (
                <div className="animate-in fade-in duration-300">
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                        <Database className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Create Tenant</h2>
                        <p className="text-xs text-slate-500">Register your company to isolate the inventory</p>
                      </div>
                    </div>
                  </div>

                  {!newCredentials ? (
                    <form onSubmit={handleRegister} className="space-y-5">
                      <div className="space-y-2">
                        <label htmlFor="companyName" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Company / Tenant Name
                        </label>
                        <div className={`relative group rounded-xl border transition-all duration-200 ${
                          focusedField === 'company'
                            ? 'border-blue-500/50 bg-blue-500/[0.03] shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
                        }`}>
                          <input
                            type="text"
                            id="companyName"
                            value={registerName}
                            onChange={(e) => { setRegisterName(e.target.value); setError(''); }}
                            onFocus={() => setFocusedField('company')}
                            onBlur={() => setFocusedField(null)}
                            placeholder="Enter your company name"
                            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm text-red-300">{error}</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="relative w-full group overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 text-sm font-semibold transition-all duration-300 shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <span>Create Credentials</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => { setStep('credentials'); setError(''); }}
                        className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors py-2 rounded-lg hover:bg-white/[0.03]"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to login</span>
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-5 text-slate-300 text-sm">
                      <div className="px-4 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 flex items-start gap-2">
                        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <p>Customer registered successfully! Save the credentials below in a safe place.</p>
                      </div>

                      <div className="space-y-3 font-mono text-xs">
                        <div className="bg-black/30 p-3 rounded-lg border border-white/[0.05]">
                          <div className="text-[10px] text-slate-500 mb-1">CUSTOMER ID:</div>
                          <div className="text-white select-all break-all">{newCredentials.id}</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded-lg border border-white/[0.05]">
                          <div className="text-[10px] text-slate-500 mb-1">CUSTOMER SECRET:</div>
                          <div className="text-white select-all break-all">{newCredentials.secret}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setCustomerId(newCredentials.id);
                          setCustomerSecret(newCredentials.secret);
                          setNewCredentials(null);
                          setStep('credentials');
                          setRegisterName('');
                        }}
                        className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <span>Go to Login</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex lg:hidden items-center justify-center gap-2 mt-6 text-[11px] text-slate-600">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active</span>
            <span className="text-slate-700">|</span>
            <span>&copy; {new Date().getFullYear()} MEO Empresas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
