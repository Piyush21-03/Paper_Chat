import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FileText, FlaskConical, BarChart2, Settings, LogOut, Menu, X, Sun, Moon } from 'lucide-react';

const Shell = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/dashboard', icon: FileText,    label: 'Documents' },
    { to: '/research',  icon: FlaskConical, label: 'Research'  },
    { to: '/eval',      icon: BarChart2,    label: 'Eval'      },
  ];

  return (
    <div
      className="flex h-screen overflow-hidden relative"
      style={{
        background: 'transparent',
        color: 'var(--text-primary)',
      }}
    >

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-60 flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-16 px-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-sm flex-shrink-0"
              style={{ background: 'var(--accent-red)', transform: 'rotate(45deg)' }}
            />
            <div className="ml-1">
              <h1 className="text-base font-bold tracking-tight font-manrope leading-tight" style={{ color: 'var(--text-primary)' }}>PaperChat</h1>
              <p className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'var(--accent-red)' }}>Scholar Suite</p>
            </div>
          </div>
          <button
            className="md:hidden p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={17} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          <div className="px-3 pb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-red)' }}>
            Modules
          </div>
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={({ isActive }) => ({
                background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                color: isActive ? 'var(--sidebar-active-text)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--border-red)' : '1px solid transparent',
              })}
            >
              <Icon size={17} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 space-y-1.5" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <NavLink
            to="/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={({ isActive }) => ({
              background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
              color: isActive ? 'var(--sidebar-active-text)' : 'var(--text-secondary)',
              border: isActive ? '1px solid var(--border-red)' : '1px solid transparent',
            })}
          >
            <Settings size={17} className="shrink-0" />
            <span>Settings</span>
          </NavLink>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer"
            style={{
              background: 'var(--bg-deep)',
              border: '1px solid var(--sidebar-border)',
              color: 'var(--text-secondary)',
            }}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
          >
            <span className="flex items-center gap-2.5">
              {isDark ? <Moon size={15} className="text-[#ef233c]" /> : <Sun size={15} className="text-amber-500" />}
              <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold"
              style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)' }}
            >
              {isDark ? 'NOIR' : 'LIGHT'}
            </span>
          </button>

          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--sidebar-border)' }}
          >
            <span
              className="truncate max-w-[120px] text-[11px] font-mono"
              style={{ color: 'var(--text-secondary)' }}
              title={user?.email}
            >
              {user?.email || 'researcher'}
            </span>
            <button
              onClick={handleLogout}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Full-screen background layer (fixed, behind everything) ── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, #040406 0%, #070305 35%, #0f0306 70%, #1a0408 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #fafafa 40%, #fff5f5 75%, #fef2f2 100%)',
        }}
        aria-hidden="true"
      >
        {isDark ? (
          <>
            <div className="stars-layer-1 opacity-70" />
            <div className="stars-layer-2 opacity-70" />
            <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-red-600/[0.08] rounded-full blur-[170px]" />
            <div className="absolute -bottom-24 left-1/3 -translate-x-1/2 w-[750px] h-[500px] bg-red-700/[0.07] rounded-full blur-[160px]" />
            <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-red-600/[0.025] rounded-full blur-[150px]" />
            <div
              className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:48px_48px]"
              style={{
                maskImage: 'radial-gradient(ellipse 95% 95% at 50% 50%, black 50%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse 95% 95% at 50% 50%, black 50%, transparent 95%)',
              }}
            />
          </>
        ) : (
          <>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-red-500/5 rounded-full blur-[140px]" />
            <div
              className="absolute inset-0 bg-[linear-gradient(rgba(239,35,60,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(239,35,60,0.02)_1px,transparent_1px)] bg-[size:48px_48px]"
              style={{
                maskImage: 'radial-gradient(ellipse 95% 95% at 50% 50%, black 50%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse 95% 95% at 50% 50%, black 50%, transparent 95%)',
              }}
            />
          </>
        )}
      </div>

      {/* ── Main ── */}
      <main
        className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10"
        style={{ background: 'transparent' }}
      >
        <header
          className="md:hidden flex items-center h-14 px-4 relative z-10"
          style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)' }}
        >
          <button
            className="p-1.5 -ml-1 rounded-md transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-5 h-5 rounded-sm" style={{ background: 'var(--accent-red)', transform: 'rotate(45deg)' }} />
            <span className="text-sm font-bold tracking-tight font-manrope ml-1" style={{ color: 'var(--text-primary)' }}>PaperChat</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto flex flex-col min-h-0 relative z-10" style={{ background: 'transparent' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Shell;
