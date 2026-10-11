import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { auth } from '@/config/firebase';
import { BACKEND_URL, buildApiUrl } from '@/config/api';

/**
 * Shared Axios instance pre-configured for the Musafir AI Backend.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to automatically attach the Firebase ID token
 * to the `Authorization: Bearer <token>` header on every request.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (err) {
      console.warn('[API Client] Error getting Firebase ID token:', err);
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

/**
 * Response interceptor for consistent error extraction.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ success?: boolean; error?: { code?: string; message?: string } }>) => {
    const errorData = error.response?.data;
    const message =
      errorData?.error?.message ||
      (typeof errorData === 'string' ? errorData : null) ||
      error.message ||
      'An unexpected network error occurred';

    console.warn(`[API ${error.config?.method?.toUpperCase()} ${error.config?.url}] Error:`, message);
    return Promise.reject(new Error(message));
  }
);

/**
 * Convenience methods
 */
export const api = {
  client: apiClient,

  get: <T = any>(url: string, config = {}) =>
    apiClient.get<T>(url, config).then((res) => res.data),

  post: <T = any>(url: string, data?: any, config = {}) =>
    apiClient.post<T>(url, data, config).then((res) => res.data),

  put: <T = any>(url: string, data?: any, config = {}) =>
    apiClient.put<T>(url, data, config).then((res) => res.data),

  patch: <T = any>(url: string, data?: any, config = {}) =>
    apiClient.patch<T>(url, data, config).then((res) => res.data),

  delete: <T = any>(url: string, config = {}) =>
    apiClient.delete<T>(url, config).then((res) => res.data),

  checkHealth: async (): Promise<{ status: string; uptime?: number }> => {
    const res = await apiClient.get<{ status: string; uptime?: number }>('/health', {
      timeout: 4000,
    });
    return res.data;
  },
};

export { BACKEND_URL, buildApiUrl };
export default api;
