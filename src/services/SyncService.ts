import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, {AUTH_TOKEN_KEY} from './api';
import type HabitService from './HabitService';

export const SYNC_SECRET_KEY = 'sync_secret';
export const SYNC_AUTH_FAILED_KEY = 'sync_auth_failed';

const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 1000;
const MAX_UNBATCHED = 500;

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface SyncResult {
  pushed: number;
  failed: number;
  errors?: string[];
}

interface SyncError {
  code?: string;
  message?: string;
  response?: {status: number; data?: {detail?: string}};
  request?: unknown;
}

function decodeJwtPayload(token: string): {exp?: number} {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {};
    }
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return {};
  }
}

function isNetworkError(error: SyncError): boolean {
  if (!error) {
    return false;
  }
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
    return true;
  }
  if (error.message === 'Network Error') {
    return true;
  }
  if (!error.response && error.request) {
    return true;
  }
  return false;
}

function is5xxError(error: SyncError): boolean {
  return (error?.response?.status ?? 0) >= 500;
}

function is401Error(error: SyncError): boolean {
  return error?.response?.status === 401;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class SyncService {
  private habitService: HabitService;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  constructor(habitService: HabitService) {
    this.habitService = habitService;
  }

  async authenticate(secret: string): Promise<void> {
    try {
      const response = await apiClient.post('/auth/token', {secret});
      const {access_token} = response.data;
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, access_token);
      await AsyncStorage.setItem(SYNC_SECRET_KEY, secret);
      await AsyncStorage.removeItem(SYNC_AUTH_FAILED_KEY);
    } catch (error: unknown) {
      const syncErr = error as SyncError;
      const message =
        syncErr.response?.data?.detail || syncErr.message || 'Authentication failed';
      throw new AuthenticationError(message);
    }
  }

  async pushUnsyncedLogs(): Promise<SyncResult> {
    // If auth previously failed permanently, don't retry
    const authFailed = await AsyncStorage.getItem(SYNC_AUTH_FAILED_KEY);
    if (authFailed === 'true') {
      return {pushed: 0, failed: 0};
    }

    const unsyncedLogs = await this.habitService.getUnsyncedLogs();

    if (unsyncedLogs.length === 0) {
      return {pushed: 0, failed: 0};
    }

    // If more than MAX_UNBATCHED logs, chunk into batches
    if (unsyncedLogs.length > MAX_UNBATCHED) {
      return this.pushInBatches(unsyncedLogs);
    }

    return this.pushBatch(unsyncedLogs);
  }

  private async pushBatch(
    logs: Awaited<ReturnType<HabitService['getUnsyncedLogs']>>,
  ): Promise<SyncResult> {
    const payload = {
      logs: logs.map(log => ({
        habit_id: log.habitId,
        completed_date: log.completedDate,
        deleted: log.deletedAt != null,
      })),
    };

    let response;
    try {
      response = await apiClient.post('/logs/sync', payload);
    } catch (error: unknown) {
      const syncErr = error as SyncError;
      if (is401Error(syncErr)) {
        const reauthed = await this.attemptReauth();
        if (reauthed) {
          // Retry once after re-auth
          try {
            response = await apiClient.post('/logs/sync', payload);
          } catch (retryError: unknown) {
            return this.handleSyncError(retryError as SyncError);
          }
        } else {
          return {pushed: 0, failed: 0};
        }
      } else {
        return this.handleSyncError(syncErr);
      }
    }

    const {synced, errors: syncErrors} = response!.data;

    const errorSet = new Set(
      (syncErrors || []).map(
        (e: {habit_id: string; completed_date: string}) =>
          `${e.habit_id}:${e.completed_date}`,
      ),
    );

    const succeeded = logs.filter(
      log => !errorSet.has(`${log.habitId}:${log.completedDate}`),
    );

    for (const log of succeeded) {
      await log.markSynced();
    }

    const errorMessages = (syncErrors || []).map(
      (e: {habit_id: string; completed_date: string; reason: string}) =>
        `${e.habit_id} (${e.completed_date}): ${e.reason}`,
    );

    return {
      pushed: synced,
      failed: (syncErrors || []).length,
      errors: errorMessages.length > 0 ? errorMessages : undefined,
    };
  }

  private async pushInBatches(
    allLogs: Awaited<ReturnType<HabitService['getUnsyncedLogs']>>,
  ): Promise<SyncResult> {
    let totalPushed = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < allLogs.length; i += BATCH_SIZE) {
      const batch = allLogs.slice(i, i + BATCH_SIZE);
      const result = await this.pushBatch(batch);
      totalPushed += result.pushed;
      totalFailed += result.failed;
      if (result.errors) {
        allErrors.push(...result.errors);
      }

      // Pause between batches (skip after last batch)
      if (i + BATCH_SIZE < allLogs.length) {
        await sleep(BATCH_PAUSE_MS);
      }
    }

    return {
      pushed: totalPushed,
      failed: totalFailed,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }

  private handleSyncError(error: SyncError): SyncResult {
    if (isNetworkError(error) || is5xxError(error)) {
      console.warn('Sync failed (will retry later):', error.message || 'Unknown error');
      return {pushed: 0, failed: 0};
    }
    // For unexpected errors, also fail silently
    console.warn('Sync failed with unexpected error:', error.message || 'Unknown error');
    return {pushed: 0, failed: 0};
  }

  private async attemptReauth(): Promise<boolean> {
    const secret = await AsyncStorage.getItem(SYNC_SECRET_KEY);
    if (!secret) {
      await AsyncStorage.setItem(SYNC_AUTH_FAILED_KEY, 'true');
      return false;
    }

    try {
      const response = await apiClient.post('/auth/token', {secret});
      const {access_token} = response.data;
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, access_token);
      await AsyncStorage.removeItem(SYNC_AUTH_FAILED_KEY);
      return true;
    } catch {
      await AsyncStorage.setItem(SYNC_AUTH_FAILED_KEY, 'true');
      return false;
    }
  }

  async isOffline(): Promise<boolean> {
    const unsyncedLogs = await this.habitService.getUnsyncedLogs();
    const isAuth = await this.isAuthenticated();
    return unsyncedLogs.length > 0 && !isAuth;
  }

  async getSyncStatus(): Promise<{
    status: 'online' | 'offline' | 'auth_failed';
    pendingCount: number;
  }> {
    const unsyncedLogs = await this.habitService.getUnsyncedLogs();
    const pendingCount = unsyncedLogs.length;

    const authFailed = await AsyncStorage.getItem(SYNC_AUTH_FAILED_KEY);
    if (authFailed === 'true') {
      return {status: 'auth_failed', pendingCount};
    }

    const isAuth = await this.isAuthenticated();
    if (!isAuth) {
      return {status: 'offline', pendingCount};
    }

    return {status: 'online', pendingCount};
  }

  async clearAuthFailedFlag(): Promise<void> {
    await AsyncStorage.removeItem(SYNC_AUTH_FAILED_KEY);
  }

  startBackgroundSync(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          this.pushUnsyncedLogs();
        }
      },
    );
  }

  debouncedSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.pushUnsyncedLogs();
      this.debounceTimer = null;
    }, 2000);
  }

  stopBackgroundSync(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  async getAuthToken(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      return false;
    }
    const payload = decodeJwtPayload(token);
    if (!payload.exp) {
      return false;
    }
    return payload.exp * 1000 > Date.now();
  }
}
