// src/__tests__/context/AuthContext.test.tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { AUTH_TOKEN_KEY, hydrateToken, setAuthToken } from '../../services/api';
import { database } from '../../models';

// Mocks for API service helpers and WatermelonDB
jest.mock('../../services/api', () => ({
  AUTH_TOKEN_KEY: 'auth_token',
  hydrateToken: jest.fn().mockResolvedValue(undefined),
  setAuthToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../models', () => ({
  database: {
    write: jest.fn(cb => cb()),
    unsafeResetDatabase: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hydrates token on mount and sets loading state appropriately', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('existing-token');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initial state check
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(hydrateToken).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
    expect(result.current.token).toBe('existing-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login updates persistent token and auth state', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login('new-jwt-token');
    });

    expect(setAuthToken).toHaveBeenCalledWith('new-jwt-token');
    expect(result.current.token).toBe('new-jwt-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout clears token and wipes local WatermelonDB database', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('existing-token');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(database.write).toHaveBeenCalled();
    expect(database.unsafeResetDatabase).toHaveBeenCalled();
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});