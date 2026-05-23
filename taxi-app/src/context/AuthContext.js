import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { user_id, role, name }
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const storedUser  = await AsyncStorage.getItem('user_data');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Auth load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function login(tokenData) {
    // tokenData = { access_token, user_id, role, name }
    const userData = {
      user_id: tokenData.user_id,
      role:    tokenData.role,
      name:    tokenData.name,
    };
    await AsyncStorage.setItem('access_token', tokenData.access_token);
    await AsyncStorage.setItem('user_data', JSON.stringify(userData));
    setToken(tokenData.access_token);
    setUser(userData);
  }

  async function updateUser(fields) {
    const updated = { ...user, ...fields };
    await AsyncStorage.setItem('user_data', JSON.stringify(updated));
    setUser(updated);
  }

  async function logout() {
    await AsyncStorage.multiRemove(['access_token', 'user_data']);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
