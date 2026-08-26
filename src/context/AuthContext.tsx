// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY, hydrateToken, setAuthToken } from '../services/api';
import { database } from '../models'; // Adjust import based on your WatermelonDB database export

interface AuthContextType {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (newToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Hydrate the cached token from persistent storage using api.ts helpers
        await hydrateToken();
        const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        if (storedToken) {
          setTokenState(storedToken);
          setUserId(decodeSubject(storedToken));
        }
      } catch (error) {
        console.error('Failed to hydrate auth token:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (newToken: string) => {
    await setAuthToken(newToken);
    setTokenState(newToken);
    setUserId(decodeSubject(newToken));
  };

  const logout = async () => {
    try {
      // 1. Clear token in persistent storage & Axios interceptor memory
      await setAuthToken(null);
      setTokenState(null);
      setUserId(null);

      // 2. Wipe local WatermelonDB so no user data remains on device
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
    } catch (error) {
      console.error('Error during logout cleanup:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        userId,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function decodeSubject(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
