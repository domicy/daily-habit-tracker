import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, {AUTH_TOKEN_KEY} from './api';
import type HabitService from './HabitService';

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
    } catch (error: any) {
      const message =
        error.response?.data?.detail || error.message || 'Authentication failed';
      throw new AuthenticationError(message);
    }
  }

  async pushUnsyncedLogs(): Promise<SyncResult> {
    const unsyncedLogs = await this.habitService.getUnsyncedLogs();

    if (unsyncedLogs.length === 0) {
      return {pushed: 0, failed: 0};
    }

    const payload = {
      logs: unsyncedLogs.map(log => ({
        habit_id: log.habitId,
        completed_date: log.completedDate,
      })),
    };

    const response = await apiClient.post('/logs/sync', payload);
    const {synced, errors: syncErrors} = response.data;

    const errorSet = new Set(
      (syncErrors || []).map(
        (e: {habit_id: string; completed_date: string}) =>
          `${e.habit_id}:${e.completed_date}`,
      ),
    );

    const succeeded = unsyncedLogs.filter(
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
