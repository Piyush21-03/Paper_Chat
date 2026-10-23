import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Shell from './components/Shell';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import Document from './pages/Document';
import Settings from './pages/Settings';
import Research from './pages/Research';
import Eval from './pages/Eval';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center animate-pulse">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.25v11.5m-5.75-5.75h11.5" />
            </svg>
          </div>
          <p className="text-slate-500 text-sm">Loading PaperChat…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

const App = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '10px',
            },
            success: { iconTheme: { primary: '#3b82f6', secondary: '#fff' } },
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Protected app routes (nested under Shell layout) */}
          <Route path="/dashboard" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
          </Route>
          <Route path="/chat" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Chat />} />
          </Route>
          <Route path="/document" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Document />} />
          </Route>
          <Route path="/research" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Research />} />
          </Route>
          <Route path="/eval" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Eval />} />
          </Route>
          <Route path="/settings" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route index element={<Settings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
