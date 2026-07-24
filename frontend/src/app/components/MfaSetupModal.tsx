import { useState, useEffect, useRef } from 'react';
import { X, Shield, CheckCircle, Copy, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { setupMfa, verifyMfa, disableMfa } from '@/app/services/api';

interface MfaSetupModalProps {
  token: string;
  mfaEnabled: boolean;
  onClose: () => void;
  onStatusChange: (enabled: boolean) => void;
}

type Step = 'loading' | 'qr' | 'verify' | 'success' | 'disable' | 'disabled' | 'error';

export function MfaSetupModal({ token, mfaEnabled, onClose, onStatusChange }: MfaSetupModalProps) {
  const [step, setStep] = useState<Step>(mfaEnabled ? 'disable' : 'loading');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'loading') {
      setError('');
      setupMfa(token)
        .then((res) => {
          if (!res.qrDataUrl || !res.secret) {
            setError('The server did not return the QR code. Please try again.');
            setStep('error');
            return;
          }
          setQrDataUrl(res.qrDataUrl);
          setSecret(res.secret);
          setStep('qr');
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'MFA_ALREADY_ENABLED') {
            setError('MFA is already active on this account.');
            setStep('error');
          } else {
            setError(msg || 'Error generating QR code. Check your connection and try again.');
            setStep('error');
          }
        });
    }
  }, [step, token]);

  useEffect(() => {
    if ((step === 'verify' || step === 'disable') && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleVerify = async () => {
    if (code.replace(/\s/g, '').length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await verifyMfa(token, code);
      onStatusChange(true);
      setStep('success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'INVALID_MFA_CODE' ? 'Invalid code. Please try again.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (code.replace(/\s/g, '').length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await disableMfa(token, code);
      onStatusChange(false);
      setStep('disabled');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'INVALID_MFA_CODE' ? 'Invalid code. Please try again.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setCode(clean);
    setError('');
  };

  const handleRetry = () => {
    setQrDataUrl('');
    setSecret('');
    setError('');
    setCode('');
    setStep('loading');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d1321] border border-white/[0.08] text-slate-100 rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Two-Factor Authentication</p>
              <p className="text-xs text-slate-400">Microsoft Authenticator (TOTP)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {/* LOADING */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Generating QR code...</p>
            </div>
          )}

          {/* ERROR */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <AlertTriangle className="w-9 h-9 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Error setting up MFA</h3>
                <p className="text-xs text-slate-400 mt-1">{error}</p>
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleRetry}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />Try again
                </button>
              </div>
            </div>
          )}

          {/* QR CODE */}
          {step === 'qr' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Step 1 — Scan the QR code</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Open <strong>Microsoft Authenticator</strong> or similar, tap <em>"Add account"</em> and point your camera at the QR code below.
                </p>
              </div>

              {qrDataUrl ? (
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <img src={qrDataUrl} alt="QR Code MFA" className="w-48 h-48" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-48 h-48 bg-white/[0.02] rounded-xl flex items-center justify-center border-2 border-dashed border-white/[0.08]">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Loading QR...</p>
                    </div>
                  </div>
                </div>
              )}

              {secret && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400">Manual key (if you cannot scan the QR):</p>
                  <div className="flex items-center gap-2 bg-black/25 border border-white/[0.08] rounded-lg px-3 py-2">
                    <code className="flex-1 text-xs font-mono text-slate-300 tracking-wider break-all">{secret}</code>
                    <button onClick={handleCopySecret} className="text-slate-400 hover:text-blue-400 transition-colors flex-shrink-0">
                      {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setCode(''); setError(''); setStep('verify'); }}
                disabled={!qrDataUrl && !secret}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                I have added it — Verify code →
              </button>
            </div>
          )}

          {/* VERIFY */}
          {step === 'verify' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Step 2 — Confirm the code</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter the <strong>6-digit code</strong> from Microsoft Authenticator to confirm.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder="000000"
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] px-4 py-3 bg-black/30 border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                />
                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setCode(''); setError(''); setStep('qr'); }}
                  className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleVerify}
                  disabled={loading || code.length !== 6}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Enable MFA
                </button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">MFA Enabled!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Starting next login, the authenticator code will be required.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Finish
              </button>
            </div>
          )}

          {/* DISABLE */}
          {step === 'disable' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">Disable MFA</p>
                  <p className="text-xs text-red-400 mt-0.5">
                    Enter the current code from Microsoft Authenticator to disable.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
                  placeholder="000000"
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] px-4 py-3 bg-black/30 border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-red-500 transition-colors"
                />
                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 text-sm font-medium rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleDisable}
                  disabled={loading || code.length !== 6}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Disable
                </button>
              </div>
            </div>
          )}

          {/* DISABLED */}
          {step === 'disabled' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                <Shield className="w-9 h-9 text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">MFA Disabled</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Login will revert to Customer ID and Secret only.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
