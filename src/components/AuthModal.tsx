import React, { useState } from 'react';
import { authClient } from '../lib/auth-client';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onAuthenticated }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          setError(result.error.message || 'Login failed');
          return;
        }
        if ((result as any).twoFactorRedirect) {
          setShow2FA(true);
          return;
        }
        onAuthenticated();
        onClose();
      } else {
        const result = await authClient.signUp.email({ email, password, name });
        if (result.error) {
          setError(result.error.message || 'Registration failed');
          return;
        }
        onAuthenticated();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode });
      if (result.error) {
        setError(result.error.message || 'Invalid code');
        return;
      }
      onAuthenticated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Verification error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-[#1E293B] border border-white/5 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#64748B] hover:text-[#F1F5F9] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[#38BDF8]">
            {show2FA ? 'Two-Factor Auth' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <p className="text-[#94A3B8] text-sm mt-1">
            {show2FA ? 'Enter the 6-digit code from your authenticator app' : mode === 'signin' ? 'Welcome back!' : 'Join Home Book Library'}
          </p>
        </div>

        {show2FA ? (
          <form onSubmit={handle2FAVerify}>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">Authentication Code</label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="w-full bg-[#0F172A] border border-white/5 rounded-xl px-4 py-3 text-[#F1F5F9] text-lg tracking-[8px] text-center font-mono outline-none focus:border-[#38BDF8]"
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-[#38BDF8] text-[#0F172A] font-bold rounded-xl transition-all disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-[#0F172A] border border-white/5 rounded-xl px-4 py-3 text-[#F1F5F9] outline-none focus:border-[#38BDF8]"
                />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0F172A] border border-white/5 rounded-xl px-4 py-3 text-[#F1F5F9] outline-none focus:border-[#38BDF8]"
              />
            </div>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0F172A] border border-white/5 rounded-xl px-4 py-3 pr-10 text-[#F1F5F9] outline-none focus:border-[#38BDF8]"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#F1F5F9] transition-colors">
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-[#38BDF8] text-[#0F172A] font-bold rounded-xl transition-all disabled:opacity-50">
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        )}

        {!show2FA && (
          <div className="mt-4 text-center">
            <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-[#38BDF8] text-sm hover:underline">
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
