import axios from 'axios';

// In development, Vite proxies /api and /ask to the backend (see vite.config.js).
// In production, the backend serves the built frontend from the same origin.
const api = axios.create({
  baseURL: '/',
});

// Attach JWT token to every request.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('paperchat-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 Unauthorized (expired / invalid token).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('paperchat-token');
      localStorage.removeItem('paperchat-user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
