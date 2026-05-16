// TODO: axios adds ~15KB gzipped to the bundle. Consider replacing with
// native fetch + a small retry wrapper (~2KB) to reduce bundle size. The
// app only uses basic GET/POST with retry logic.
import axios from 'axios';
import type {AxiosError, InternalAxiosRequestConfig} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = 'https://habit-tracker.tunnel.example.com';
export const AUTH_TOKEN_KEY = 'auth_token';

// Per-request retry budget. axios-retry's default 3 retries with exponential
// backoff stalls pushInBatches for ~28s per failing chunk; one quick retry is
// enough to ride out a transient blip without holding the whole loop hostage.
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

// Circuit breaker. After this many consecutive failures we stop hitting the
// network for COOLDOWN_MS so the rest of pushInBatches can fail fast instead
// of paying the timeout + retry cost on every batch.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker open: skipping request');
    this.name = 'CircuitOpenError';
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

let cachedToken: string | null = null;
let tokenHydrated = false;

async function hydrateToken(): Promise<void> {
  if (tokenHydrated) {
    return;
  }
  cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  tokenHydrated = true;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  tokenHydrated = true;
  if (token === null) {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  } else {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (consecutiveFailures < BREAKER_THRESHOLD) {
    return false;
  }
  if (Date.now() - breakerOpenedAt < BREAKER_COOLDOWN_MS) {
    return true;
  }
  // Cooldown elapsed: half-open — allow the next attempt to probe.
  consecutiveFailures = 0;
  return false;
}

export function isCircuitOpen(): boolean {
  return breakerIsOpen();
}

function isRetryableError(error: AxiosError): boolean {
  if (!error.response) {
    return true;
  }
  return error.response.status >= 500;
}

apiClient.interceptors.request.use(async config => {
  if (breakerIsOpen()) {
    throw new CircuitOpenError();
  }
  await hydrateToken();
  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & {__retryCount?: number};

apiClient.interceptors.response.use(
  response => {
    consecutiveFailures = 0;
    return response;
  },
  async (error: AxiosError) => {
    if (error instanceof CircuitOpenError) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableConfig | undefined;
    const attempts = config?.__retryCount ?? 0;
    if (config && attempts < MAX_RETRIES && isRetryableError(error)) {
      config.__retryCount = attempts + 1;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return apiClient.request(config);
    }

    // Only count transient failures against the breaker — 4xx is a client
    // problem the breaker can't help with.
    if (isRetryableError(error)) {
      consecutiveFailures += 1;
      if (consecutiveFailures === BREAKER_THRESHOLD) {
        breakerOpenedAt = Date.now();
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
