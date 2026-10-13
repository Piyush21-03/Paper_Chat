import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Eye, EyeOff, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (user) navigate('/dashboard');
    if (searchParams.get('expired')) {
      toast('Your session expired. Please log in again.', { icon: '⚠️' });
    }
  }, [user, navigate, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-gradient-to-b from-blue-600 to-blue-800 p-10 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg">PaperChat</span>
        </div>
        <div>
          <blockquote className="text-white/90 text-xl font-medium leading-relaxed mb-6">
            "Ask any question about your research papers and get grounded, cited answers instantly."
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              PC
            </div>
            <div>
              <p className="text-white font-medium text-sm">PaperChat</p>
              <p className="text-white/60 text-xs">RAG-powered document intelligence</p>
            </div>
          </div>
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
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-slate-400">Sign in to your PaperChat account</p>
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
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
            </div>

            <button
              type="submit"
              id="login-submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-600/20 mt-2"
            >
              {isLoading ? (
                <><Loader2 size={18} className="animate-spin" /> Signing in…</>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
