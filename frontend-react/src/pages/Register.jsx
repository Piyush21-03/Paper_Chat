import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Eye, EyeOff, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

const PasswordStrength = ({ password }) => {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      {checks.map(({ label, ok }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-400' : 'text-slate-500'}`}>
          <CheckCircle2 size={11} className={ok ? 'text-green-400' : 'text-slate-600'} />
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
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
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
    <div className="min-h-screen flex bg-slate-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-gradient-to-b from-slate-800 to-slate-900 border-r border-white/5 p-10 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg">PaperChat</span>
        </div>
        <div className="space-y-8">
          {[
            { emoji: '📄', title: 'Upload any PDF', desc: 'Research papers, reports, textbooks — instantly indexed.' },
            { emoji: '💬', title: 'Ask in plain English', desc: 'No query syntax needed. Just ask your question.' },
            { emoji: '🔍', title: 'Get cited answers', desc: 'Every answer links back to the source page.' },
          ].map(({ emoji, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl flex-shrink-0">
                {emoji}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-slate-400 text-sm mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-8"
          >
            <ArrowLeft size={15} /> Back to home
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Create your account</h1>
            <p className="text-slate-400">Start chatting with your research papers for free</p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Min 8 characters"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <button
              type="submit"
              id="register-submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-600/20 mt-2"
            >
              {isLoading ? (
                <><Loader2 size={18} className="animate-spin" /> Creating account…</>
              ) : (
                'Create free account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
