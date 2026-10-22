import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we have a token and user cached
    const token = localStorage.getItem('paperchat-token');
    const cachedUser = localStorage.getItem('paperchat-user');

    if (token && cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch (e) {
        console.error("Failed to parse cached user");
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    const { access_token, user } = response.data;
    
    localStorage.setItem('paperchat-token', access_token);
    localStorage.setItem('paperchat-user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const register = async (email, password) => {
    const response = await api.post('/api/auth/register', { email, password });
    const { access_token, user } = response.data;
    
    localStorage.setItem('paperchat-token', access_token);
    localStorage.setItem('paperchat-user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    // Fire and forget logout to backend (invalidates server side if implemented)
    api.post('/api/auth/logout').catch(() => {});
    
    localStorage.removeItem('paperchat-token');
    localStorage.removeItem('paperchat-user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
