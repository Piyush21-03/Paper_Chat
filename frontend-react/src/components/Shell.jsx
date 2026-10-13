import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, FlaskConical, BarChart2, Settings, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import toast from 'react-hot-toast';

const Shell = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('paperchat-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('paperchat-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/dashboard', icon: FileText, label: 'Documents' },
    { to: '/research', icon: FlaskConical, label: 'Research' },
    { to: '/eval', icon: BarChart2, label: 'Eval' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 transition-colors">
      
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-xl font-bold tracking-tight">PaperChat</h1>
          <button 
            className="md:hidden p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <NavLink
            to="/settings"
            className={({ isActive }) => 
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50'
              }`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </NavLink>

          <div className="flex items-center justify-between px-3 py-2 mt-4 text-sm text-slate-600 dark:text-slate-400">
            <span className="truncate max-w-[140px]" title={user?.email}>{user?.email}</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button 
                onClick={handleLogout}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-red-500 hover:text-red-600 dark:text-red-400"
                title="Log out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="md:hidden flex items-center h-16 px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button 
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <span className="ml-2 text-lg font-semibold">PaperChat</span>
        </header>
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Shell;
