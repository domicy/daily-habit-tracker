// src/__tests__/context/AuthContext.test.tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// Mock native AsyncStorage using official Jest mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mocks for API service helpers and WatermelonDB
jest.mock('../../services/api', () => ({
  AUTH_TOKEN_KEY: 'auth_token',
  hydrateToken: jest.fn().mockResolvedValue(undefined),
  setAuthToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../models', () => ({
  database: {
    write: jest.fn((cb: () => void) => cb()),
    unsafeResetDatabase: jest.fn().mockResolvedValue(undefined),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { AUTH_TOKEN_KEY, hydrateToken, setAuthToken } from '../../services/api';
import { database } from '../../models';

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

  it('sessionExpired ends the session but keeps local data', async () => {
    // A background 401 can no longer re-authenticate on the user's behalf
    // (issue #125), so it ends the session — but wiping the database here
    // would destroy logs recorded offline and never pushed.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY2NvdW50LTEifQ.sig',
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(result.current.userId).toBe('account-1');

    await act(async () => {
      await result.current.sessionExpired();
    });

    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(result.current.token).toBeNull();
    expect(result.current.userId).toBeNull();
    // Back at the sign-in screen with everything still on the device.
    expect(result.current.isAuthenticated).toBe(false);
    expect(database.unsafeResetDatabase).not.toHaveBeenCalled();
  });
});