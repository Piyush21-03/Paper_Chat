import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Eye, EyeOff, ArrowLeft, AlertCircle, Loader2, CheckCircle2, ArrowRight, Sun, Moon } from 'lucide-react';

const PasswordStrength = ({ password }) => {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {checks.map(({ label, ok }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-500 font-medium' : 'text-zinc-500'}`}>
          <CheckCircle2 size={11} className={ok ? 'text-emerald-500' : 'text-zinc-400'} />
          {label}
        </div>
      ))}
    </div>
  );
};

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register, user } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setIsLoading(true);
    try {
      await register(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account. Email may already be in use.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex relative overflow-hidden transition-colors"
      style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}
    >
      <div className="stars-layer-1" aria-hidden="true" />
      <div className="stars-layer-2" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: 'radial-gradient(ellipse 50% 50% at 70% 40%, rgba(239,35,60,0.06) 0%, transparent 70%)' }} aria-hidden="true" />

      {/* Floating Theme Toggle (Top Right) */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full border transition-all cursor-pointer flex items-center justify-center shadow-sm"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
        >
          {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-[#ef233c]" />}
        </button>
      </div>

      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[400px] p-10 flex-shrink-0 relative z-10"
        style={{ background: 'var(--bg-deep)', borderRight: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-sm" style={{ background: 'var(--accent-red)', transform: 'rotate(45deg)' }} />
          <span className="font-bold text-lg tracking-tight font-manrope ml-1" style={{ color: 'var(--text-primary)' }}>PaperChat</span>
        </div>

        <div className="space-y-7">
          {[
            { emoji: '📄', title: 'Upload & Ingest PDFs', desc: 'Pre-processed with vector embeddings and BM25 inverted indices.' },
            { emoji: '💬', title: 'Scholarly Dialogue', desc: 'Targeted technical reasoning powered by verified source context.' },
            { emoji: '🔍', title: 'Grounded Citations', desc: 'Direct jump links to exact passages in the document viewport.' },
          ].map(({ emoji, title, desc }) => (
            <div key={title} className="flex items-start gap-3.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                {emoji}
              </div>
              <div>
                <p className="font-semibold text-xs font-manrope" style={{ color: 'var(--text-primary)' }}>{title}</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          Research-grade retrieval augmented generation
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors mb-8 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft size={14} /> Back to home
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2 tracking-tight font-manrope" style={{ color: 'var(--text-primary)' }}>Create Account</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Initialize your personal research workspace</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-lg text-sm" style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}>
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }} htmlFor="email">Email Address</label>
              <input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none transition-all"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                placeholder="researcher@university.edu"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }} htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-lg text-sm focus:outline-none transition-all"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                  placeholder="Min 8 characters" minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <button
              type="submit" id="register-submit" disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed mt-3 py-3 rounded-lg transition-colors cursor-pointer"
              style={{ background: 'var(--accent-red)' }}
            >
              {isLoading ? <><Loader2 size={16} className="animate-spin" /> Creating Account…</> : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold transition-colors" style={{ color: 'var(--accent-red)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
