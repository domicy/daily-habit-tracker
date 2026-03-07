// TODO: axios + axios-retry add ~15-30KB gzipped to the bundle.
// Consider replacing with native fetch + a small retry wrapper (~2KB)
// to reduce bundle size. The app only uses basic GET/POST with retry logic.
import axios from 'axios';
import axiosRetry from 'axios-retry';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = 'https://habit-tracker.tunnel.example.com';
export const AUTH_TOKEN_KEY = 'auth_token';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosRetry(apiClient, {
  retries: 3,
  retryDelay: (retryCount: number) => Math.pow(2, retryCount - 1) * 1000,
  retryCondition: error =>
    axiosRetry.isNetworkError(error) ||
    (error.response != null && error.response.status >= 500),
});

export default apiClient;
