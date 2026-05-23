import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../services/api';

const NetworkContext = createContext({ isOffline: false });

export function NetworkProvider({ children }) {
  const [isOffline, setIsOffline] = useState(false);
  const failCount = useRef(0);

  useEffect(() => {
    const respId = api.interceptors.response.use(
      (res) => {
        failCount.current = 0;
        setIsOffline(false);
        return res;
      },
      (err) => {
        if (!err.response) {
          failCount.current += 1;
          if (failCount.current >= 2) setIsOffline(true);
        } else {
          failCount.current = 0;
          setIsOffline(false);
        }
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(respId);
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => useContext(NetworkContext);
