import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FileText, FlaskConical, BarChart2, Settings, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';

const Shell = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
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
    <div className="flex h-screen overflow-hidden relative" style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>

      {/* ── Star field ── */}
      <div className="stars-layer-1" aria-hidden="true" />
      <div className="stars-layer-2" aria-hidden="true" />

      {/* ── Red ambient glow ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 20% 50%, rgba(239,35,60,0.05) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

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

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <header
          className="md:hidden flex items-center h-14 px-4"
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

        <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-void)' }}>
          <div className="p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Shell;
