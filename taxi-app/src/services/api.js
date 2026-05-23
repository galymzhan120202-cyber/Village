import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---- Серверіңіздің мекенжайы ----
// Локалды тестілеу кезінде: компьютердің IP мекенжайын жазыңыз
// Мысалы: 'http://192.168.1.5:8000'
// Продакшенда: 'https://your-domain.com'
export const BASE_URL = 'http://172.20.10.6:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Әр сұранысқа JWT токен қосу
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const authAPI = {
  register:      (data) => api.post('/api/auth/register', data),
  login:         (data) => api.post('/api/auth/login', data),
  getProfile:    ()     => api.get('/api/auth/profile'),
  updateProfile: (data) => api.put('/api/auth/profile', data),
};

// ─── АУЫЛДАР ─────────────────────────────────────────────────────────────────
export const villagesAPI = {
  getAll: () => api.get('/api/villages/'),
  updateCoords: (id, lat, lon) =>
    api.put(`/api/villages/${id}/coords`, { lat, lon }),
};

// ─── ТАПСЫРЫСТАР ─────────────────────────────────────────────────────────────
export const ordersAPI = {
  create:      (data) => api.post('/api/orders/', data),
  myActive:    ()     => api.get('/api/orders/my'),
  history:     ()     => api.get('/api/orders/history'),
  available:   ()     => api.get('/api/orders/available'),
  accept:      (id)   => api.post(`/api/orders/${id}/accept`),
  finish:      (id)   => api.post(`/api/orders/${id}/finish`),
  cancel:      ()     => api.post('/api/orders/cancel'),
  drop:        (id)   => api.post(`/api/orders/${id}/drop`),
  getMessages: (id)   => api.get(`/api/orders/${id}/messages`),
  sendMessage: (id, text) => api.post(`/api/orders/${id}/messages`, { text }),
  rate:        (id, rating, comment) => api.post(`/api/orders/${id}/rate`, { rating, comment }),
};

// ─── ТӨЛЕМДЕР ────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  addCard:         (data) => api.post('/api/payments/add-card', data),
  myCards:         ()     => api.get('/api/payments/my-cards'),
  removeCard:      (id)   => api.delete(`/api/payments/card/${id}`),
  commissionLogs:  ()     => api.get('/api/payments/commission-logs'),
};

// ─── ЖҮРГІЗУШІ ───────────────────────────────────────────────────────────────
export const driverAPI = {
  profile: () => api.get('/api/drivers/profile'),
  startWork: (data) => api.post('/api/drivers/start-work', data),
  stopWork: () => api.post('/api/drivers/stop-work'),
  passengers: () => api.get('/api/drivers/passengers'),
  earnings: () => api.get('/api/drivers/earnings'),
  reviews: () => api.get('/api/drivers/reviews'),
  updateLocation: (lat, lon) =>
    api.post(`/api/drivers/location?lat=${lat}&lon=${lon}`),
  onlineDrivers: () => api.get('/api/drivers/online'),
  savePushToken: (token) => api.post('/api/drivers/push-token', { token }),
};

// ─── АДМИН ───────────────────────────────────────────────────────────────────
export const adminAPI = {
  stats: () => api.get('/api/admin/stats'),
  users: () => api.get('/api/admin/users'),
  ban: (id, reason) => api.post(`/api/admin/ban/${id}`, { reason }),
  unban: (id) => api.post(`/api/admin/unban/${id}`),
  clearDebt: (id) => api.post(`/api/admin/clear-debt/${id}`),
};

export default api;
